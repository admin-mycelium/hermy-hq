import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { allowedHQSession } from '@/lib/hq-session';
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}) {
 if(!await allowedHQSession())return NextResponse.json({error:'Unauthorized'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Same-origin operator action required'},{status:403});
 const {id}=await ctx.params;const b=await req.json().catch(()=>({}));
 if(!['approve','reject','edit'].includes(b.action))return NextResponse.json({error:'Unsupported action'},{status:400});
 const row=await prisma.agentRequest.findUnique({where:{id}});
 if(!row)return NextResponse.json({error:'Not found'},{status:404});
 if(!['awaiting_approval','queued'].includes(row.status))return NextResponse.json({error:'Request is no longer pending'},{status:409});
 if(b.action!=='reject'&&process.env.HQ_COMMANDS_ENABLED!=='true')return NextResponse.json({error:'Commands unavailable pending routing acceptance'},{status:503});
 if(b.action!=='reject'&&(row.instanceId!=='sporekeeper'||row.profileId!=='default'||row.kind!=='oneshot'))
  return NextResponse.json({error:'Unqualified target/kind: reject this request and create an explicit supported one'},{status:409});
 const update:{status:string;decidedAt?:Date;title?:string;prompt?:string}={status:b.action==='approve'?'approved':b.action==='reject'?'rejected':'awaiting_approval'};
 if(b.action==='edit') {
  if(typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>8000)return NextResponse.json({error:'Bounded prompt required'},{status:400});
  update.prompt=b.prompt.trim();update.title=(typeof b.title==='string'?b.title:b.prompt).trim().slice(0,200);
 }else update.decidedAt=new Date();
 const result=await prisma.agentRequest.updateMany({where:{id,status:row.status,updatedAt:row.updatedAt},data:update});
 if(!result.count)return NextResponse.json({error:'Request changed; refresh before acting'},{status:409});
 return NextResponse.json({request:await prisma.agentRequest.findUnique({where:{id}})});
}
