// TEMPORÁRIO: teste ponta a ponta do login (será removido).
import { SB_URL, SB_ANON, json } from './_lib/access.js';
import me from './me.js';
import chat from './chat.js';
import cfg from './config.js';
export const config = { runtime: 'edge' };
export default async function handler(req) {
  const u = new URL(req.url);
  if (u.searchParams.get('t') !== 'f9440a02b0990c31e802debf') return json({ error: 'nope' }, 404);
  const out = {};
  const email = 'teste.chiclete.' + Date.now() + '@example.com', password = 'Teste123!';
  const h = { apikey: SB_ANON(), 'content-type': 'application/json' };
  let r = await fetch(SB_URL() + '/functions/v1/signup', { method: 'POST', headers: h, body: JSON.stringify({ email, password }) });
  out.signup = [r.status, await r.text()];
  r = await fetch(SB_URL() + '/functions/v1/signup', { method: 'POST', headers: h, body: JSON.stringify({ email, password }) });
  out.signupAgain = [r.status, await r.text()];
  r = await fetch(SB_URL() + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h, body: JSON.stringify({ email, password }) });
  const tok = await r.json(); out.login = r.status;
  r = await fetch(SB_URL() + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'errada' }) });
  out.badLogin = r.status;
  const auth = { authorization: 'Bearer ' + tok.access_token };
  out.cfg = await (await cfg(new Request(u.origin + '/api/config'))).json();
  r = await me(new Request(u.origin + '/api/me', { headers: auth })); out.me = [r.status, await r.text()];
  r = await me(new Request(u.origin + '/api/me')); out.meNoLogin = r.status;
  r = await chat(new Request(u.origin + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Say hi' }] }) }));
  out.chatNoLogin = r.status;
  r = await chat(new Request(u.origin + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with just: hi' }] }) }));
  out.chatLogged = [r.status, (await r.text()).slice(0, 160)];
  out.email = email;
  return json(out);
}
