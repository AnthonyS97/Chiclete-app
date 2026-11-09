// Situação da conta: teste grátis, assinante ou vencido.
import { authEnabled, account, json } from './_lib/access.js';
export const config = { runtime: 'edge' };
export default async function handler(req) {
  if (!authEnabled()) return json({ auth: false });
  const { status, body } = await account(req, { action: 'status' });
  return json(status === 200 ? { auth: true, ...body } : body, status);
}
