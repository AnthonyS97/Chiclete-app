// Situação da conta: teste grátis, assinante ou vencido.
import { authEnabled, getUser, accessFor, json } from './_lib/access.js';
export const config = { runtime: 'edge' };
export default async function handler(req) {
  if (!authEnabled()) return json({ auth: false });
  const user = await getUser(req);
  if (!user) return json({ error: 'login_required' }, 401);
  const { profile, status } = await accessFor(user);
  return json({ auth: true, email: profile.email || user.email, ...status });
}
