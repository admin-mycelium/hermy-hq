import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../hermes-bridge/bridge.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function runRequest('),source.indexOf('async function processQueue('));
async function check(change,expectedRuns,claim=true){
 const runs=[];const queries=[];
 const ctx=vm.createContext({Date,RUN_TIMEOUT_MS:1000,log:()=>{},emit:async()=>{},refusedReason:()=>null,
 q:async(sql,args)=>{queries.push({sql,args});return {rowCount:claim?1:0}},
 hermes:async(args)=>{runs.push(args);return 'synthetic test only'}});
 vm.runInContext(body+';globalThis.run=runRequest;',ctx);
 await ctx.run({id:'unit-only',title:'synthetic fixture',prompt:'return test',instanceId:'sporekeeper',profileId:'default',kind:'oneshot',status:'approved',decidedAt:new Date(),updatedAt:new Date(),...change});
 assert.equal(runs.length,expectedRuns);
 if(expectedRuns)assert.deepEqual([...runs[0]],['--profile','default','-z','return test']);
 return {case:change.name??JSON.stringify(change),modelExecutions:0,syntheticExecutorCalls:runs.length};
}
const tests=[];
for(const [c,n,claim] of [[{name:'explicit default routing'},1,true],[{name:'missing target',instanceId:null},0,true],[{name:'wrong installation',instanceId:'caretaker'},0,true],[{name:'wrong profile',profileId:'trading'},0,true],[{name:'not human-approved',status:'queued'},0,true],[{name:'expired approval',decidedAt:new Date(Date.now()-31*60000)},0,true],[{name:'claim race'},0,false],[{name:'refused kind',kind:'cron.run'},0,true]])tests.push(await check(c,n,claim));
console.log(JSON.stringify({routingUnitTests:'passed',actualModelExecutions:0,tests}));
