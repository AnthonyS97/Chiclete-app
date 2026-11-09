// Pede ao Supabase o link de pagamento do Mercado Pago.
// Mensal: assinatura que renova sozinha (cartão). Anual: pagamento único (Pix ou cartão), 12 meses.
import { authEnabled, account, json } from './_lib/access.js';
export const config = { runtime: 'edge' };
export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!authEnabled()) return json({ error: 'auth_disabled' }, 400);
  let b = {};
  try { b = await req.json(); } catch {}
  const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '');
  const { status, body } = await account(req, { action: 'checkout', plan: b.plan === 'annual' ? 'annual' : 'monthly', appUrl });
  return json(body, status);
}
