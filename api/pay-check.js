// Diagnóstico do pagamento: confere se o Mercado Pago está ligado (sem mostrar chaves nem dados).
import { SB_URL, json } from './_lib/access.js';
export const config = { runtime: 'edge' };
export default async function handler() {
  try {
    const r = await fetch(SB_URL() + '/functions/v1/mp-webhook?check=1');
    return json(await r.json());
  } catch (e) { return json({ erro: 'sem_resposta' }, 502); }
}
