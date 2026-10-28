import { redirect } from 'next/navigation';
import { allowedHQSession } from '@/lib/hq-session';
import { FleetConsole } from '@/components/fleet-console';
export const dynamic = 'force-dynamic';
export default async function FleetPage() {
  if (!await allowedHQSession()) redirect('/login');
  return <FleetConsole mode="fleet"/>;
}
