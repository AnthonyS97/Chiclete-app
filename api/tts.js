// Voz neural dos professores (Vercel Edge Function).
// O texto chega com o inglês marcado entre **asteriscos**. Cada trecho é gerado no idioma certo:
// português com pronúncia brasileira nativa e inglês com pronúncia americana nativa.
// Os trechos são gerados em paralelo e unidos num único áudio MP3.
// Opcional: usa a OPENAI_API_KEY. Sem ela, o app usa a voz do próprio celular.

import { guard } from './_lib/access.js';

export const config = { runtime: 'edge' };

const PERSONA = {
  lua: {
    voice: process.env.TTS_VOICE_LUA || 'coral',
    tone: 'You are Lua, a warm, upbeat and playful English teacher in her early thirties. Sound like a real person smiling while she talks: natural rhythm, light enthusiasm, small natural pauses.',
  },
  anthony: {
    voice: process.env.TTS_VOICE_ANTHONY || 'ash',
    tone: 'You are Anthony, a calm, friendly English teacher in his thirties, relaxed and kind with a hint of dry humor. Natural conversational pace with short pauses.',
  },
};
const LANG = {
  pt: 'Speak ONLY in Brazilian Portuguese with a native Brazilian accent (neutral, like São Paulo), natural Brazilian intonation and rhythm. Never sound foreign or European Portuguese.',
  en: 'Speak ONLY in English with a native General American accent, clear and natural, slightly slower so a Brazilian beginner can follow.',
};
const MAX_CHARS = 700;
const MAX_SEGMENTS = 8;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function segments(text) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  const out = [];
  parts.forEach((s, i) => {
    const t = s.replace(/\*\*/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return;
    const lang = i % 2 === 1 ? 'en' : 'pt';
    const last = out[out.length - 1];
    if (last && last.lang === lang) last.text += ' ' + t;
    else out.push({ lang, text: t });
  });
  // junta o excesso no último trecho para não fazer chamadas demais
  while (out.length > MAX_SEGMENTS) {
    const x = out.pop();
    out[out.length - 1].text += ' ' + x.text;
  }
  return out;
}

export default async function handler(req) {
  if (req.method === 'GET') return json({ enabled: !!process.env.OPENAI_API_KEY });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const blocked = await guard(req);
  if (blocked) return blocked;
  const accessCode = process.env.ACCESS_CODE;
  const sent = (req.headers.get('x-access-code') || '').trim().toLowerCase();
  if (accessCode && sent !== accessCode.trim().toLowerCase()) return json({ error: 'forbidden' }, 401);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'tts_not_configured' }, 501);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const raw = String(body.text || '').slice(0, MAX_CHARS);
  const segs = segments(raw);
  if (!segs.length) return json({ error: 'no_text' }, 400);
  const p = PERSONA[body.teacher] || PERSONA.lua;
  const slow = body.slow ? ' Speak noticeably slower and very clearly, as if helping a beginner repeat.' : '';

  const speak = async (seg) => {
    const call = (payload) =>
      fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key.trim(), 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    let r = await call({
      model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
      voice: p.voice,
      input: seg.text,
      instructions: `${p.tone} ${LANG[seg.lang]}${slow}`,
      response_format: 'mp3',
    });
    if (r.status === 404 || r.status === 400) {
      r = await call({ model: 'tts-1', voice: body.teacher === 'anthony' ? 'onyx' : 'nova', input: seg.text, response_format: 'mp3', speed: body.slow ? 0.85 : 1 });
    }
    if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
    return new Uint8Array(await r.arrayBuffer());
  };

  try {
    const chunks = await Promise.all(segs.map(speak));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return new Response(out, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
  } catch (e) {
    console.error('TTS error', String(e));
    return json({ error: 'tts_error' }, 502);
  }
}
