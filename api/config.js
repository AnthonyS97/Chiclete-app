// Configuração pública do app (sem segredos): diz se o login está ligado e os preços.
import { authEnabled, SB_URL, SB_ANON, PLANS, TRIAL_DAYS, MP_TOKEN, json } from './_lib/access.js';
export const config = { runtime: 'edge' };
export default function handler() {
  if (!authEnabled()) return json({ auth: false });
  return json({
    auth: true,
    supabaseUrl: SB_URL(),
    supabaseKey: SB_ANON(),
    google: (process.env.AUTH_GOOGLE || '') === '1',
    payments: !!MP_TOKEN(),
    trialDays: TRIAL_DAYS,
    plans: { monthly: PLANS.monthly.price, annual: PLANS.annual.price },
  });
}
