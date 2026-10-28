import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { allowedHQSession } from '@/lib/hq-session';
export async function GET() {
 if(!await allowedHQSession())return NextResponse.json({error:'Unauthorized'},{status:401});
 return NextResponse.json({instanceId:'sporekeeper',profileId:'default',enabled:process.env.HQ_COMMANDS_ENABLED==='true'}, {headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request) {
 if (!await allowedHQSession()) return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.HQ_COMMANDS_ENABLED!=='true')return NextResponse.json({error:'Commands unavailable pending current-version routing acceptance'},{status:503});
 const origin=req.headers.get('origin');
 if (!origin || origin!==new URL(req.url).origin) return NextResponse.json({error:'Same-origin operator action required'},{status:403});
 const b=await req.json().catch(()=>null);
 if (!b || b.instanceId!=='sporekeeper' || b.profileId!=='default' || b.kind!=='oneshot')
  return NextResponse.json({error:'Explicit supported target required: sporekeeper/default, oneshot only'},{status:400});
 const prompt=typeof b.prompt==='string'?b.prompt:typeof b.title==='string'?b.title:'';
 if(!prompt.trim()||prompt.length>8000||typeof b.requestKey!=='string'||!/^[0-9a-f-]{36}$/i.test(b.requestKey))
  return NextResponse.json({error:'Bounded prompt and unique request key required'},{status:400});
 // A prompt can run tools. Never let a browser checkbox bypass human approval.
 const row=await prisma.agentRequest.upsert({where:{requestKey:b.requestKey},update:{},create:{
  origin:'web',kind:'oneshot',title:prompt.trim().slice(0,200),prompt:prompt.trim(),sideEffecting:true,
  status:'awaiting_approval',instanceId:'sporekeeper',profileId:'default',requestKey:b.requestKey}});
 return NextResponse.json({request:row},{headers:{'Cache-Control':'no-store'}});
}
