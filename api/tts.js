// Voz neural dos professores (Vercel Edge Function).
// Opcional: usa a mesma OPENAI_API_KEY da transcrição. Sem ela, o app usa a voz do próprio celular.

export const config = { runtime: 'edge' };

const VOICES = {
  lua: {
    voice: process.env.TTS_VOICE_LUA || 'coral',
    style:
      'You are Lua, a warm, upbeat and playful Brazilian English teacher in her early thirties. Speak like a real person smiling while she talks: natural rhythm, light enthusiasm, small natural pauses. Portuguese parts in a natural Brazilian accent; English parts in clear, natural American English, slightly slower so a beginner can follow.',
  },
  anthony: {
    voice: process.env.TTS_VOICE_ANTHONY || 'ash',
    style:
      'You are Anthony, a calm, friendly American English teacher from Texas who lived in Brazil. Relaxed, confident and kind, with a hint of dry humor. Natural conversational pace with short pauses. Speak Portuguese with a light, friendly American accent and English in clear, natural American English, slightly slower for a beginner.',
  },
};
const MAX_CHARS = 700;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method === 'GET') return json({ enabled: !!process.env.OPENAI_API_KEY });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const accessCode = process.env.ACCESS_CODE;
  const sent = (req.headers.get('x-access-code') || '').trim().toLowerCase();
  if (accessCode && sent !== accessCode.trim().toLowerCase()) return json({ error: 'forbidden' }, 401);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'tts_not_configured' }, 501);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const text = String(body.text || '').replace(/\*\*/g, '').trim().slice(0, MAX_CHARS);
  if (!text) return json({ error: 'no_text' }, 400);
  const t = VOICES[body.teacher] || VOICES.lua;
  const instructions = t.style + (body.slow ? ' Speak noticeably slower and very clearly, as if helping a beginner repeat.' : '');

  const call = (payload) =>
    fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key.trim(), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

  let r = await call({ model: process.env.TTS_MODEL || 'gpt-4o-mini-tts', voice: t.voice, input: text, instructions, response_format: 'mp3' });
  if (r.status === 404 || r.status === 400) {
    // modelo reserva (sem instruções de estilo)
    r = await call({ model: 'tts-1', voice: body.teacher === 'anthony' ? 'onyx' : 'nova', input: text, response_format: 'mp3', speed: body.slow ? 0.85 : 1 });
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('TTS error', r.status, detail.slice(0, 300));
    return json({ error: 'tts_error', status: r.status }, 502);
  }
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
}
