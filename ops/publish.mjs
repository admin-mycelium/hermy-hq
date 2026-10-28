// Analytics publisher. No model invocation or source-ledger write capability.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {isDeepStrictEqual} from 'node:util';
const instance=process.env.HQ_INSTANCE;
if(!['sporekeeper','caretaker'].includes(instance))throw Error('instance_refused');
const exec=(file,args)=>execFileSync(file,args,{encoding:'utf8',timeout:20000,maxBuffer:300000}).trim();
const now=new Date().toISOString();
let version=null,revision=null,gateway='unknown',dashboard='unknown';
let homes,run;
if(instance==='caretaker') {
 const out=exec('/home/milan/.local/bin/hermes',['--version']);version=out.match(/v?0\.\d+\.\d+/)?.[0]?.replace(/^v/,'')??null;
 revision=exec('git',['-C','/home/milan/.hermes/hermes-agent','rev-parse','HEAD']);
 const active=(name)=>{try{return exec('systemctl',['--user','is-active',name])}catch{return 'inactive'}};
 gateway=active('hermes-gateway.service');dashboard=active('hermes-dashboard.service');
 homes=[['default','/home/milan/.hermes'],['researcher','/home/milan/.hermes/profiles/researcher']];
}else {
 const out=exec('/docker/hermes/hermy-hq-bridge/hermes-wrap.sh',['--version']);version=out.match(/v?0\.\d+\.\d+/)?.[0]?.replace(/^v/,'')??null;
 revision=out.match(/\b[0-9a-f]{40}\b/)?.[0]??null; // image-managed install may not contain .git
 const state=JSON.parse(exec('docker',['inspect','--format','{{json .State}}','hermes-hermes-1']));
 // Container running is not proof of gateway functional health.
 gateway=state.Running?'container running; gateway not functionally tested':'container stopped';
 dashboard='not independently checked';
 homes=[['default','/opt/data'],['trading','/opt/data/profiles/trading']];
}
const rows=homes.map(([profileId,home])=>{
 let configured;
 if(instance==='caretaker') configured=fs.existsSync(home+'/config.yaml');
 else {try{exec('docker',['exec','hermes-hermes-1','test','-f',home+'/config.yaml']);configured=true}catch{configured=false}}
 return {instanceId:instance,profileId,kind:'runtime',runId:'runtime',observedAt:now,schemaVersion:1,payload:{version,revision,configured,gateway,dashboard,executionScope:'shared installation; dedicated profile execution not attested'}};
});
if(instance==='sporekeeper') {
 // Fixed source helper passed through stdin by execFileSync; never execute source data.
 const script=fs.readFileSync(new URL('./export-trader.py',import.meta.url),'utf8');
 run=JSON.parse(execFileSync('docker',['exec','-u','hermes','-e','HOME=/opt/data','-i','hermes-hermes-1','/opt/hermes/.venv/bin/python3','-B','-'],{input:script,encoding:'utf8',timeout:25000,maxBuffer:250000}));
 rows.push(run);
}
const url=new URL(process.env.HQ_PUBLISHER_URL||'');
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const pool=new pg.Pool({connectionString:url.toString(),max:1,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:8000,query_timeout:10000});
try {
 const accepted=[];
 for(const r of rows) {
  if(r.schemaVersion!==1||r.instanceId!==instance||!homes.some(([p])=>p===r.profileId)||!['runtime','trader'].includes(r.kind)||!r.observedAt||!r.runId)throw Error('snapshot_refused');
  const serialized=JSON.stringify(r.payload);if(serialized.length>200000)throw Error('snapshot_oversize');
  const result=await pool.query(`INSERT INTO hq_analytics_v1.snapshots(instance_id,profile_id,kind,run_id,observed_at,schema_version,payload) VALUES($1,$2,$3,$4,$5,1,$6::jsonb) ON CONFLICT(instance_id,profile_id,kind,run_id) DO UPDATE SET observed_at=EXCLUDED.observed_at,ingested_at=clock_timestamp(),payload=EXCLUDED.payload WHERE EXCLUDED.observed_at>hq_analytics_v1.snapshots.observed_at RETURNING observed_at`,[r.instanceId,r.profileId,r.kind,r.runId,r.observedAt,serialized]);
  let reconciled = null;
  if(result.rowCount===1) {
   const stored=(await pool.query(`SELECT observed_at,payload FROM hq_analytics_v1.snapshots WHERE instance_id=$1 AND profile_id=$2 AND kind=$3 AND run_id=$4`,[r.instanceId,r.profileId,r.kind,r.runId])).rows[0];
   if(new Date(stored.observed_at).getTime()===Date.parse(r.observedAt)) {
    reconciled=isDeepStrictEqual(stored.payload,r.payload);if(!reconciled)throw Error('source_snapshot_mismatch');
   }
  }
  accepted.push({profile:r.profileId,kind:r.kind,run:r.runId,updated:result.rowCount===1,sourcePayloadMatchesStored:reconciled,observedAt:r.observedAt});
 }
 console.log(JSON.stringify({instance,accepted}));
} catch(e) {console.error(JSON.stringify({instance,error:'publish_failed',code:e.code??null,name:e.name}));process.exitCode=1}
finally{await pool.end()}
