-- Browser sessions may read their RLS-filtered onboarding state only.
-- Mutations are exclusively performed by the service-role Edge Function.
revoke all privileges on table public.dright_client_onboarding from anon, authenticated;
grant select on table public.dright_client_onboarding to authenticated;
