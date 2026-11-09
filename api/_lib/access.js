// Login e assinatura (compartilhado pelas funções da pasta /api).
// Login: Supabase Auth. A conta do aluno (teste grátis e assinatura) é cuidada pela
// função "account" que roda dentro do Supabase, onde fica a chave de serviço.
// Pagamentos: Mercado Pago (também dentro do Supabase).
// Enquanto AUTH_ON não for "1" na Vercel, o app continua aberto como antes.

const env = (k) => (process.env[k] || '').trim();
export const SB_URL = () => (env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
export const SB_ANON = () => env('SUPABASE_ANON_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
export const authEnabled = () => !!(SB_URL() && SB_ANON() && env('AUTH_ON') === '1');
export const PLANS = { monthly: 15.0, annual: 119.9 };
export const TRIAL_DAYS = 7;

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Chama a função "account" do Supabase em nome do aluno logado.
export async function account(req, payload) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return { status: 401, body: { error: 'login_required' } };
  const r = await fetch(SB_URL() + '/functions/v1/account', {
    method: 'POST',
    headers: { apikey: SB_ANON(), authorization: h, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = {};
  try { body = await r.json(); } catch {}
  if (r.status === 401) return { status: 401, body: { error: 'login_required' } };
  return { status: r.status, body };
}

// Portão das funções que gastam IA. Devolve uma Response de erro ou null (liberado).
export async function guard(req) {
  if (!authEnabled()) return null;
  const { status, body } = await account(req, { action: 'status' });
  if (status === 401) return json({ error: 'login_required' }, 401);
  if (status !== 200) return null; // problema no servidor de contas: não bloqueia o aluno
  if (body.state === 'expired') return json({ error: 'payment_required' }, 402);
  return null;
}
