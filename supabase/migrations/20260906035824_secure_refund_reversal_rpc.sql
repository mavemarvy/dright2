revoke all on function public.process_marketplace_refund(uuid) from public, anon, authenticated;
grant execute on function public.process_marketplace_refund(uuid) to service_role;