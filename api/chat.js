// Servidor de IA do Chiclete English (Vercel Edge Function).
// Recebe a conversa do app, chama a API do Claude e devolve a resposta em streaming.
// A chave da API fica SÓ aqui no servidor (variável ANTHROPIC_API_KEY na Vercel).

export const config = { runtime: 'edge' };

const MODELS = {
  fast: process.env.MODEL_FAST || 'claude-haiku-5-5',  // barato e rápido (padrão)
  max: process.env.MODEL_MAX || 'claude-sonnet-5-5',   // mais preciso, ~20x mais caro
};
const FALLBACK_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'];
const MAX_MESSAGES = 40;      // tamanho máximo do histórico
const MAX_CHARS_FIRST = 40000; // instruções do professor (1ª mensagem)
const MAX_CHARS_MSG = 2000;    // cada mensagem depois disso
const MAX_OUTPUT_TOKENS = 700;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'missing_api_key' }, 500);

  // Teste fechado opcional: se ACCESS_CODE estiver definido, o app pede o código.
  const accessCode = process.env.ACCESS_CODE;
  const sent = (req.headers.get('x-access-code') || '').trim().toLowerCase();
  if (accessCode && sent !== accessCode.trim().toLowerCase()) {
    return json({ error: 'forbidden' }, 401);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const { messages, quality } = body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json({ error: 'bad_messages' }, 400);
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const limit = i === 0 ? MAX_CHARS_FIRST : MAX_CHARS_MSG * 3;
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > limit) {
      return json({ error: 'bad_message', index: i }, 400);
    }
  }
  if (messages[messages.length - 1].role !== 'user') return json({ error: 'must_end_with_user' }, 400);

  // A 1ª mensagem traz as instruções fixas do professor: marcamos para cache (fica mais barato).
  const apiMessages = messages.map((m, i) =>
    i === 0
      ? { role: 'user', content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : { role: m.role, content: m.content }
  );

  // Se o modelo escolhido não existir na conta (404), tenta os modelos reserva.
  const first = quality === 'max' ? MODELS.max : MODELS.fast;
  const candidates = [first, ...FALLBACK_MODELS.filter((m) => m !== first)];
  let upstream, detail = '';
  for (const model of candidates) {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: MAX_OUTPUT_TOKENS, stream: true, messages: apiMessages }),
    });
    if (upstream.ok) break;
    detail = await upstream.text().catch(() => '');
    console.error('Anthropic error', model, upstream.status, detail.slice(0, 500));
    if (upstream.status !== 404) break;
  }

  if (!upstream.ok) {
    let message = '';
    try { message = JSON.parse(detail).error.message || ''; } catch { message = detail; }
    return json(
      { error: 'upstream_error', status: upstream.status, detail: String(message).slice(0, 200) },
      upstream.status === 429 || upstream.status === 529 ? 429 : 502
    );
  }

  // Repassa o streaming (Server-Sent Events) direto para o app.
  return new Response(upstream.body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  });
}
