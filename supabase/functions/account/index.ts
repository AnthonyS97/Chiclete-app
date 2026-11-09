// Chiclete English: conta do aluno (teste grátis e assinatura).
// Roda dentro do Supabase, onde a chave de serviço já existe: ela nunca sai daqui.
// Ações (POST JSON): { action: "status" } e { action: "checkout", plan: "monthly" | "annual", appUrl }.

const PLANS = {
  monthly: { price: 15.0, label: "Chiclete Premium · Mensal" },
  annual: { price: 119.9, label: "Chiclete Premium · Anual (12 meses pelo preço de 8)" },
};
const TRIAL_DAYS = 7;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP = () => (Deno.env.get("MP_ACCESS_TOKEN") || "").trim();
const FN_URL = SB_URL + "/functions/v1";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...cors } });

const db = (path: string, init: RequestInit = {}) =>
  fetch(SB_URL + "/rest/v1" + path, {
    ...init,
    headers: { apikey: SERVICE, authorization: "Bearer " + SERVICE, "content-type": "application/json", ...(init.headers || {}) },
  });

async function getUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: ANON, authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

async function getProfile(user: { id: string; email?: string }) {
  const r = await db(`/profiles?id=eq.${user.id}&select=*`);
  const rows = r.ok ? await r.json() : [];
  if (rows[0]) return rows[0];
  const p = { id: user.id, email: user.email ?? null, trial_ends: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() };
  const ins = await db("/profiles", { method: "POST", headers: { prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify(p) });
  const got = ins.ok ? await ins.json() : [];
  return got[0] || p;
}

async function update(id: string, patch: Record<string, unknown>) {
  const r = await db(`/profiles?id=eq.${id}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch("https://api.mercadopago.com" + path, {
    ...init,
    headers: { authorization: "Bearer " + MP(), "content-type": "application/json", ...(init.headers || {}) },
  });
  let body: any = null;
  try { body = await r.json(); } catch { /* vazio */ }
  return { ok: r.ok, status: r.status, body };
}

function statusOf(p: any) {
  const now = new Date().toISOString();
  if (p.paid_until && p.paid_until > now) return { state: "paid", plan: p.plan, until: p.paid_until };
  if (p.trial_ends && p.trial_ends > now) {
    const days = Math.max(1, Math.ceil((new Date(p.trial_ends).getTime() - Date.now()) / 864e5));
    return { state: "trial", days, until: p.trial_ends };
  }
  return { state: "expired", plan: p.plan || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const user = await getUser(req);
  if (!user) return json({ error: "login_required" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  let p = await getProfile(user);

  if (body.action === "checkout") {
    if (!MP()) return json({ error: "payments_not_configured" }, 501);
    const plan = body.plan === "annual" ? "annual" : "monthly";
    const appUrl = String(body.appUrl || "https://chiclete-app.vercel.app").replace(/\/$/, "");
    const email = p.email || user.email;
    if (plan === "monthly") {
      const r = await mp("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: PLANS.monthly.label, external_reference: user.id, payer_email: email,
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: PLANS.monthly.price, currency_id: "BRL" },
          back_url: appUrl + "/?pago=mensal", notification_url: FN_URL + "/mp-webhook", status: "pending",
        }),
      });
      if (!r.ok || !r.body?.init_point) return json({ error: "mp_error", status: r.status, detail: r.body?.message }, 502);
      await update(user.id, { mp_preapproval_id: r.body.id });
      return json({ url: r.body.init_point });
    }
    const r = await mp("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: "chiclete-anual", title: PLANS.annual.label, quantity: 1, unit_price: PLANS.annual.price, currency_id: "BRL" }],
        payer: { email }, external_reference: user.id + "|annual",
        back_urls: { success: appUrl + "/?pago=anual", pending: appUrl + "/?pago=pendente", failure: appUrl + "/?pago=erro" },
        auto_return: "approved", notification_url: FN_URL + "/mp-webhook", statement_descriptor: "CHICLETE",
      }),
    });
    if (!r.ok || !r.body?.init_point) return json({ error: "mp_error", status: r.status, detail: r.body?.message }, 502);
    return json({ url: r.body.init_point });
  }

  // status (padrão). Assinatura mensal vencida: confere no Mercado Pago se renovou.
  let st = statusOf(p);
  if (st.state !== "paid" && p.plan === "monthly" && p.mp_preapproval_id && MP()) {
    const r = await mp("/preapproval/" + p.mp_preapproval_id);
    if (r.ok && r.body?.status === "authorized" && r.body.next_payment_date) {
      const until = new Date(new Date(r.body.next_payment_date).getTime() + 3 * 864e5).toISOString();
      p = (await update(p.id, { paid_until: until })) || p;
      st = statusOf(p);
    }
  }
  return json({ email: p.email || user.email, payments: !!MP(), ...st });
});
