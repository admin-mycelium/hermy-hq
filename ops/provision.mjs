// Operator-approved one-time additive migration. Owner credential stays on the VPS.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const dir=process.env.HQ_RELEASE_DIR;
if(!dir?.startsWith('/docker/hermes/reports/hermy-hq-fleet-'))throw Error('evidence_path_required');
const base=new URL(process.env.DATABASE_URL||process.env.POSTGRES_URL);
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])base.searchParams.delete(k);
const connect=(url)=>new pg.Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,query_timeout:20000});
const owner=connect(base.toString());
let migrated=false;
const secrets={};
try {
 await owner.query('BEGIN');
 const pending=await owner.query(`SELECT status,count(*)::int n FROM public."AgentRequest" WHERE status IN ('queued','approved','running') GROUP BY status`);
 if(pending.rows.length)throw Error('command_queue_not_idle');
 const existing=await owner.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name='hq_analytics_v1'`);
 if(existing.rows.length)throw Error('schema_already_exists_inspect_do_not_replay');
 const baseline=await owner.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('AgentRequest','DataStore') ORDER BY table_name,ordinal_position`);
 fs.writeFileSync(dir+'/schema-before.json',JSON.stringify(baseline.rows,null,2),{mode:0o600});
 for(const name of ['hq_reader_v1','hq_pub_spore_v1','hq_pub_care_v1']) {
  const password=randomBytes(32).toString('hex');
  await owner.query(`CREATE ROLE ${name} LOGIN NOINHERIT PASSWORD '${password}'`);
  await owner.query(`ALTER ROLE ${name} SET statement_timeout='15s'`);
  const u=new URL(base);u.username=name;u.password=password;
  secrets[name]=u.toString();
 }
 await owner.query(fs.readFileSync(dir+'/analytics-v1.sql','utf8'));
 await owner.query('COMMIT');migrated=true;
 fs.writeFileSync(dir+'/new-role-credentials.json',JSON.stringify(secrets),{mode:0o600});
 const receipts={migration:'committed',tests:[]};
 for(const [role,url] of Object.entries(secrets)){
  const c=connect(url);
  try {
   const info=await c.query('SELECT current_user AS role');
   receipts.tests.push({role:info.rows[0].role,login:true});
   // A positive/negative transaction is always rolled back; no fake snapshot survives.
   if(role==='hq_reader_v1') {
    await c.query('SELECT count(*) FROM hq_analytics_v1.profiles');
    await c.query('BEGIN');
    let denied=false;try{await c.query(`INSERT INTO hq_analytics_v1.snapshots(instance_id,profile_id,kind,run_id,observed_at,schema_version,payload) VALUES('caretaker','default','runtime','test',now(),1,'{}')`)}catch(e){denied=e.code==='42501'}
    await c.query('ROLLBACK');
    if(!denied)throw Error('reader_write_not_refused');
    receipts.tests.push({role,readerWriteDenied:true});
   }else {
    const own=role==='hq_pub_spore_v1'?'sporekeeper':'caretaker';const other=own==='sporekeeper'?'caretaker':'sporekeeper';
    await c.query('BEGIN');
    await c.query(`INSERT INTO hq_analytics_v1.snapshots(instance_id,profile_id,kind,run_id,observed_at,schema_version,payload) VALUES($1,'default','runtime','acceptance-rollback',now(),1,'{}')`,[own]);
    await c.query('ROLLBACK');
    await c.query('BEGIN');
    let denied=false;try{await c.query(`INSERT INTO hq_analytics_v1.snapshots(instance_id,profile_id,kind,run_id,observed_at,schema_version,payload) VALUES($1,'default','runtime','acceptance-rollback',now(),1,'{}')`,[other])}catch(e){denied=e.code==='42501'}
    await c.query('ROLLBACK');
    if(!denied)throw Error('publisher_cross_instance_not_refused');
    receipts.tests.push({role,ownWriteRollback:true,crossInstanceDenied:true});
   }
   let denied=false;try{await c.query('SELECT id FROM public."AgentRequest" LIMIT 0')}catch(e){denied=e.code==='42501'}
   if(!denied)throw Error('analytics_role_can_read_command_bus');
   receipts.tests.push({role,commandBusReadDenied:true});
  }finally{await c.end()}
 }
 fs.writeFileSync(dir+'/analytics-permissions.json',JSON.stringify(receipts,null,2),{mode:0o600});
 fs.mkdirSync('/docker/hermes/hermy-hq-analytics-v1',{recursive:true,mode:0o700});
 fs.writeFileSync('/docker/hermes/hermy-hq-analytics-v1/publisher.env',`HQ_INSTANCE=sporekeeper\nHQ_PUBLISHER_URL='${secrets.hq_pub_spore_v1}'\n`,{mode:0o600});
 // Only the explicitly new, scoped reader/NUC publisher credentials enter the intended handoff pipe.
 process.stdout.write(JSON.stringify({readerUrl:secrets.hq_reader_v1,caretakerPublisherUrl:secrets.hq_pub_care_v1,receipt:receipts}));
}catch(e){
 if(!migrated)await owner.query('ROLLBACK').catch(()=>{});
 fs.writeFileSync(dir+'/provision-failure.json',JSON.stringify({committed:migrated,name:e.name,code:e.code??null,message:e.message==='schema_already_exists_inspect_do_not_replay'?e.message:'provision_or_qualification_failed'}),{mode:0o600});
 console.error(JSON.stringify({error:'provision_or_qualification_failed',committed:migrated,code:e.code??null}));process.exitCode=1;
}finally{await owner.end()}
