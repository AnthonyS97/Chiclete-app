// Cria o pagamento no Mercado Pago e devolve o link para o aluno pagar.
// Mensal: assinatura que renova sozinha (cartão). Anual: pagamento único (Pix ou cartão), 12 meses.
import { authEnabled, getUser, getProfile, updateProfile, mp, MP_TOKEN, PLANS, json } from './_lib/access.js';
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!authEnabled()) return json({ error: 'auth_disabled' }, 400);
  if (!MP_TOKEN()) return json({ error: 'payments_not_configured' }, 501);
  const user = await getUser(req);
  if (!user) return json({ error: 'login_required' }, 401);
  let body = {};
  try { body = await req.json(); } catch {}
  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const origin = new URL(req.url).origin;
  const appUrl = (process.env.APP_URL || origin).replace(/\/$/, '');
  const profile = await getProfile(user);
  const email = profile.email || user.email;

  if (plan === 'monthly') {
    const r = await mp('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: PLANS.monthly.label,
        external_reference: user.id,
        payer_email: email,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: PLANS.monthly.price, currency_id: 'BRL' },
        back_url: appUrl + '/?pago=mensal',
        notification_url: appUrl + '/api/mp-webhook',
        status: 'pending',
      }),
    });
    if (!r.ok || !r.body || !r.body.init_point) return json({ error: 'mp_error', status: r.status, detail: r.body && (r.body.message || r.body.error) }, 502);
    await updateProfile(user.id, { mp_preapproval_id: r.body.id });
    return json({ url: r.body.init_point });
  }

  const r = await mp('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: 'chiclete-anual', title: PLANS.annual.label, quantity: 1, unit_price: PLANS.annual.price, currency_id: 'BRL' }],
      payer: { email },
      external_reference: user.id + '|annual',
      back_urls: { success: appUrl + '/?pago=anual', pending: appUrl + '/?pago=pendente', failure: appUrl + '/?pago=erro' },
      auto_return: 'approved',
      notification_url: appUrl + '/api/mp-webhook',
      statement_descriptor: 'CHICLETE',
    }),
  });
  if (!r.ok || !r.body || !r.body.init_point) return json({ error: 'mp_error', status: r.status, detail: r.body && (r.body.message || r.body.error) }, 502);
  return json({ url: r.body.init_point });
}
