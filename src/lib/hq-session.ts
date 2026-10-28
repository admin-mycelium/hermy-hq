import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// No internal-secret or development bypass: every fleet read needs an operator session.
export async function allowedHQSession(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email);
}
