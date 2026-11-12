// Voz neural dos professores (Vercel Edge Function).
// O texto chega com o inglês marcado entre **asteriscos**. Cada trecho é gerado no idioma certo:
// português com pronúncia brasileira nativa e inglês com pronúncia americana nativa.
// Os trechos são gerados em paralelo e unidos num único áudio MP3.
// Opcional: usa a OPENAI_API_KEY. Sem ela, o app usa a voz do próprio celular.

import { guard } from './_lib/access.js';

export const config = { runtime: 'edge' };

// Cada professor tem voz própria e um sotaque brasileiro regional no português.
// O inglês é sempre americano padrão (General American) para todos.
const PERSONA = {
  lua: {
    voice: process.env.TTS_VOICE_LUA || 'marin', fallback: 'nova',
    tone: 'You are Lua, a warm, upbeat and playful English teacher in her early thirties. Sound like a real person smiling while she talks: natural rhythm, light enthusiasm, small natural pauses.',
    pt: 'Speak ONLY in Brazilian Portuguese with a strong, clearly recognizable paulistana accent from the city of São Paulo (capital): the urban paulistano melody, slightly nasal and fast, the typical paulistano "r" and "e" sounds, energetic rhythm, like a young woman from Vila Madalena chatting with a friend. A Brazilian listener must immediately recognize she is from São Paulo.',
  },
  charles: {
    voice: process.env.TTS_VOICE_CHARLES || process.env.TTS_VOICE_ANTHONY || 'cedar', fallback: 'echo',
    tone: 'You are Charles, a calm, friendly English teacher in his thirties, relaxed and kind with a hint of dry humor. Natural conversational pace with short pauses.',
    pt: 'Speak ONLY in Brazilian Portuguese with a strong, clearly recognizable sul-mato-grossense accent from Campo Grande: interior center-west Brazilian accent with the marked retroflex "r" ("porrrta", "amorrr"), open and calm vowels, unhurried country rhythm, a relaxed guy from the interior. A Brazilian listener must immediately recognize the interior/Mato Grosso do Sul accent.',
  },
  mark: {
    voice: process.env.TTS_VOICE_MARK || 'ballad', fallback: 'onyx',
    tone: 'You are Mark, a patient, cozy and gentle English teacher in his forties who loves telling little stories. Warm, unhurried voice with a soft smile.',
    pt: 'Speak ONLY in Brazilian Portuguese with a strong, clearly recognizable mineiro accent from Minas Gerais: the soft sing-song mineiro melody, words glued together and shortened ("cê", "trem", "uai", "pão de queijo" said the mineiro way), gentle and warm, unhurried, like a kind man from Belo Horizonte telling a story. A Brazilian listener must immediately recognize he is mineiro.',
  },
  zoe: {
    voice: process.env.TTS_VOICE_ZOE || 'coral', fallback: 'shimmer',
    tone: 'You are Zoe, an energetic, bright and motivating English teacher in her late twenties. Sunny, confident, joyful energy and a big smile in the voice.',
    pt: 'Speak ONLY in Brazilian Portuguese with a strong, clearly recognizable baiano accent from Salvador, Bahia: very open vowels ("é", "ó"), the musical rising-and-falling Bahian melody, warm and joyful, expressive like a young woman from Salvador hyping up a friend. A Brazilian listener must immediately recognize she is baiana.',
  },
};
PERSONA.anthony = PERSONA.charles;
const LANG = {
  pt: 'Sound like a real native speaker of that region talking naturally with a friend: the accent must be clearly regional and authentic, but natural and affectionate, not a parody. Never sound foreign, robotic or European Portuguese.',
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
  if (req.method === 'GET') {
    const enabled = !!process.env.OPENAI_API_KEY;
    // ?check=1: confere se a OpenAI aceita a chave (nunca mostra a chave).
    if (enabled && new URL(req.url).searchParams.get('check')) {
      let auth = 0;
      try { auth = (await fetch('https://api.openai.com/v1/models/gpt-4o-mini-tts', { headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY.trim() } })).status; } catch { auth = -1; }
      return json({ enabled, auth });
    }
    return json({ enabled });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const blocked = await guard(req);
  // TTS curto (apresentações e versos de música) também funciona antes de criar a conta.
  if (blocked && !(blocked.status === 401 && Number(req.headers.get('content-length') || 0) < 400)) return blocked;
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
  const human = ' Sound completely human and spontaneous: natural breathing, micro-pauses, smiles and emotion in the voice, never a robotic or announcer tone.';
  const sing = body.sing ? ' This is a line from a catchy, upbeat pop song for English learners: say it rhythmically, musically and with joy, almost singing, like a fun chorus, keeping every word clear.' : '';

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
      instructions: `${p.tone}${human} ${seg.lang === 'pt' ? p.pt + ' ' + LANG.pt : LANG.en}${slow}${sing}`,
      response_format: 'mp3',
    });
    if (r.status === 404 || r.status === 400) {
      r = await call({ model: 'tts-1', voice: p.fallback, input: seg.text, response_format: 'mp3', speed: body.slow ? 0.85 : 1 });
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
