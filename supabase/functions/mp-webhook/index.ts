// Avisos do Mercado Pago. Nunca confia no aviso: busca o pagamento/assinatura
// direto no Mercado Pago antes de liberar o acesso.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP = () => (Deno.env.get("MP_ACCESS_TOKEN") || "").trim();
const ok = (status = 200) => new Response(JSON.stringify({ ok: status === 200 }), { status, headers: { "content-type": "application/json" } });
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

const update = (id: string, patch: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SERVICE, authorization: "Bearer " + SERVICE, "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
const mp = async (path: string) => {
  const r = await fetch("https://api.mercadopago.com" + path, { headers: { authorization: "Bearer " + MP() } });
  return { ok: r.ok, body: r.ok ? await r.json() : null };
};

Deno.serve(async (req) => {
  if (!MP()) return ok();
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const type = String(body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  if (!id) return ok();
  try {
    if (type.includes("preapproval")) {
      const r = await mp("/preapproval/" + encodeURIComponent(id));
      const s = r.body;
      if (r.ok && s && isUuid(s.external_reference)) {
        const patch: Record<string, unknown> = { mp_preapproval_id: s.id, plan: "monthly" };
        if (s.status === "authorized" && s.next_payment_date)
          patch.paid_until = new Date(new Date(s.next_payment_date).getTime() + 3 * 864e5).toISOString();
        await update(s.external_reference, patch);
      }
    } else if (type.includes("payment")) {
      const r = await mp("/v1/payments/" + encodeURIComponent(id));
      const p = r.body;
      if (r.ok && p?.status === "approved" && typeof p.external_reference === "string") {
        const [uid, kind] = p.external_reference.split("|");
        if (isUuid(uid) && kind === "annual") {
          const base = new Date(p.date_approved || Date.now());
          await update(uid, { plan: "annual", paid_until: new Date(base.getTime() + 366 * 864e5).toISOString(), mp_last_payment_id: String(p.id) });
        }
      }
    }
  } catch {
    return ok(500); // o Mercado Pago tenta de novo
  }
  return ok();
});
