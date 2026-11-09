-- Chiclete English: tabela de contas (rodar uma vez no Supabase → SQL Editor).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  trial_ends timestamptz not null default (now() + interval '7 days'),
  plan text,                 -- 'monthly' | 'annual'
  paid_until timestamptz,    -- acesso pago válido até
  mp_preapproval_id text,    -- assinatura mensal no Mercado Pago
  mp_last_payment_id text
);
alter table public.profiles enable row level security;
-- O aluno só pode LER a própria linha. Quem escreve é só o servidor (chave de serviço).
drop policy if exists "ler o proprio perfil" on public.profiles;
create policy "ler o proprio perfil" on public.profiles for select using (auth.uid() = id);
