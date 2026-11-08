// Transcrição da fala do aluno (Vercel Edge Function).
// Usada quando o navegador não tem reconhecimento de voz próprio (ex.: alguns iPhones e navegadores dentro de apps).
// Opcional: só funciona se a variável OPENAI_API_KEY estiver configurada na Vercel.
// Sem ela, o app mostra ao aluno como usar o ditado do teclado.

export const config = { runtime: 'edge' };

const MAX_BYTES = 6 * 1024 * 1024; // ~30 s de áudio

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  // GET: o app pergunta se a transcrição está ligada.
  if (req.method === 'GET') return json({ enabled: !!process.env.OPENAI_API_KEY });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const accessCode = process.env.ACCESS_CODE;
  const sent = (req.headers.get('x-access-code') || '').trim().toLowerCase();
  if (accessCode && sent !== accessCode.trim().toLowerCase()) return json({ error: 'forbidden' }, 401);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'stt_not_configured' }, 501);

  let form;
  try { form = await req.formData(); } catch { return json({ error: 'bad_form' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || file.size === 0) return json({ error: 'no_audio' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'audio_too_long' }, 413);
  const lang = form.get('lang') === 'pt' ? 'pt' : 'en';

  const out = new FormData();
  out.append('file', file, file.name || 'fala.webm');
  out.append('model', process.env.STT_MODEL || 'whisper-1');
  out.append('language', lang);

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key.trim() },
    body: out,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('STT error', r.status, detail.slice(0, 300));
    return json({ error: 'stt_error', status: r.status }, 502);
  }
  const data = await r.json().catch(() => ({}));
  return json({ text: (data.text || '').trim() });
}
