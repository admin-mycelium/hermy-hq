import { NextResponse } from 'next/server';
import { allowedHQSession } from '@/lib/hq-session';
import { readFleet } from '@/lib/fleet-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!await allowedHQSession()) return NextResponse.json({error:'Unauthorized'},{status:401});
  try { return NextResponse.json(await readFleet(),{headers:{'Cache-Control':'private, no-store'}}); }
  catch { return NextResponse.json({error:'Fleet telemetry unavailable. Last-known values must not be treated as current.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
