// Registra erros do app no celular do aluno (ex.: microfone), para diagnóstico. Sem dados pessoais.
export const config = { runtime: 'edge' };
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const t = (await req.text()).slice(0, 800);
    console.log('CLIENT', t, '| UA:', (req.headers.get('user-agent') || '').slice(0, 200));
  } catch {}
  return new Response('ok');
}
