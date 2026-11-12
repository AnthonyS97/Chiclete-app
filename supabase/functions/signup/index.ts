// Chiclete English: cria a conta do aluno (e-mail e senha) já confirmada.
// Assim o login não depende de link por e-mail. A chave de serviço nunca sai do Supabase.
// (Mesmo código publicado no Supabase como função "signup", verify_jwt desligado.)
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRIAL_DAYS = 7;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...cors } });
const admin = { apikey: SERVICE, authorization: "Bearer " + SERVICE, "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let b: any = {};
  try { b = await req.json(); } catch { /* vazio */ }
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const name = String(b.name || "").trim().slice(0, 40);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 120) return json({ error: "bad_email" }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: "weak_password" }, 400);

  const r = await fetch(SB_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: name ? { name } : {} }),
  });
  const u = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(u?.msg || u?.message || u?.error_code || "");
    if (r.status === 422 || /already|exists|registered/i.test(msg)) return json({ error: "exists" }, 409);
    return json({ error: "signup_failed" }, 502);
  }
  // Começa o teste grátis.
  await fetch(SB_URL + "/rest/v1/profiles", {
    method: "POST",
    headers: { ...admin, prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ id: u.id, email, trial_ends: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() }),
  });
  return json({ ok: true });
});
