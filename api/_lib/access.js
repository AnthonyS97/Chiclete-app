// Login e assinatura (compartilhado pelas funções da pasta /api).
// Login: Supabase Auth (Google ou link por e-mail). Assinatura: Mercado Pago.
// Enquanto o Supabase não estiver configurado na Vercel, o app continua aberto como antes.

export const PLANS = {
  monthly: { price: 15.0, label: 'Chiclete Premium · Mensal' },
  annual: { price: 119.9, label: 'Chiclete Premium · Anual (12 meses pelo preço de 8)' },
};
export const TRIAL_DAYS = 7;

const env = (k) => (process.env[k] || '').trim();
export const SB_URL = () => (env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
export const SB_ANON = () => env('SUPABASE_ANON_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
const SB_SERVICE = () => env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
export const authEnabled = () => !!(SB_URL() && SB_ANON() && SB_SERVICE());
export const MP_TOKEN = () => env('MP_ACCESS_TOKEN') || env('MERCADO_PAGO_ACCESS_TOKEN');

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const sbAdmin = (path, init = {}) =>
  fetch(SB_URL() + path, {
    ...init,
    headers: { apikey: SB_SERVICE(), authorization: 'Bearer ' + SB_SERVICE(), 'content-type': 'application/json', ...(init.headers || {}) },
  });

// Confere o token de login enviado pelo app e devolve o usuário.
export async function getUser(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const r = await fetch(SB_URL() + '/auth/v1/user', { headers: { apikey: SB_ANON(), authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export async function getProfile(user) {
  const r = await sbAdmin(`/rest/v1/profiles?id=eq.${user.id}&select=*`);
  const rows = r.ok ? await r.json() : [];
  if (rows[0]) return rows[0];
  // Primeiro acesso: começa o teste grátis.
  const p = {
    id: user.id,
    email: user.email || null,
    trial_ends: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
  };
  const ins = await sbAdmin('/rest/v1/profiles', { method: 'POST', headers: { prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify(p) });
  const got = ins.ok ? await ins.json() : [];
  return got[0] || p;
}

export async function updateProfile(id, patch) {
  const r = await sbAdmin(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(patch) });
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

export async function mp(path, init = {}) {
  const r = await fetch('https://api.mercadopago.com' + path, {
    ...init,
    headers: { authorization: 'Bearer ' + MP_TOKEN(), 'content-type': 'application/json', ...(init.headers || {}) },
  });
  let body = null;
  try { body = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, body };
}

// Assinatura mensal: se o pagamento venceu, confere direto no Mercado Pago se renovou.
async function refreshMonthly(p) {
  if (!p.mp_preapproval_id || !MP_TOKEN()) return p;
  const r = await mp('/preapproval/' + p.mp_preapproval_id);
  if (!r.ok || !r.body) return p;
  if (r.body.status === 'authorized' && r.body.next_payment_date) {
    const until = new Date(new Date(r.body.next_payment_date).getTime() + 3 * 864e5).toISOString();
    if (until > (p.paid_until || '')) return (await updateProfile(p.id, { paid_until: until, plan: 'monthly' })) || p;
  }
  return p;
}

export function statusOf(p) {
  const now = new Date().toISOString();
  if (p.paid_until && p.paid_until > now) return { state: 'paid', plan: p.plan, until: p.paid_until };
  if (p.trial_ends && p.trial_ends > now) {
    const days = Math.max(1, Math.ceil((new Date(p.trial_ends) - Date.now()) / 864e5));
    return { state: 'trial', days, until: p.trial_ends };
  }
  return { state: 'expired', plan: p.plan || null };
}

export async function accessFor(user) {
  let p = await getProfile(user);
  let st = statusOf(p);
  if (st.state !== 'paid' && p.plan === 'monthly') { p = await refreshMonthly(p); st = statusOf(p); }
  return { profile: p, status: st };
}

// Portão das funções que gastam IA. Devolve uma Response de erro ou null (liberado).
export async function guard(req) {
  if (!authEnabled()) return null;
  const user = await getUser(req);
  if (!user) return json({ error: 'login_required' }, 401);
  const { status } = await accessFor(user);
  if (status.state === 'expired') return json({ error: 'payment_required' }, 402);
  return null;
}
