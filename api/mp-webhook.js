// Avisos do Mercado Pago. Nunca confia no conteúdo do aviso:
// sempre busca o pagamento/assinatura direto no Mercado Pago antes de liberar o acesso.
import { authEnabled, mp, MP_TOKEN, updateProfile, json } from './_lib/access.js';
export const config = { runtime: 'edge' };

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s || '');

export default async function handler(req) {
  if (!authEnabled() || !MP_TOKEN()) return json({ ok: true });
  const url = new URL(req.url);
  let body = {};
  try { body = await req.json(); } catch {}
  const type = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '';
  const id = String((body.data && body.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id') || '');
  if (!id) return json({ ok: true });

  try {
    if (type.includes('preapproval')) {
      const r = await mp('/preapproval/' + encodeURIComponent(id));
      const s = r.body;
      if (r.ok && s && isUuid(s.external_reference)) {
        const patch = { mp_preapproval_id: s.id, plan: 'monthly' };
        if (s.status === 'authorized' && s.next_payment_date)
          patch.paid_until = new Date(new Date(s.next_payment_date).getTime() + 3 * 864e5).toISOString();
        await updateProfile(s.external_reference, patch);
      }
    } else if (type.includes('payment')) {
      const r = await mp('/v1/payments/' + encodeURIComponent(id));
      const p = r.body;
      if (r.ok && p && p.status === 'approved' && typeof p.external_reference === 'string') {
        const [uid, kind] = p.external_reference.split('|');
        if (isUuid(uid) && kind === 'annual') {
          const base = new Date(p.date_approved || Date.now());
          await updateProfile(uid, { plan: 'annual', paid_until: new Date(base.getTime() + 366 * 864e5).toISOString(), mp_last_payment_id: String(p.id) });
        }
      }
    }
  } catch (e) {
    return json({ ok: false }, 500); // o Mercado Pago tenta de novo
  }
  return json({ ok: true });
}
