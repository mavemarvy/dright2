drop policy if exists "Support staff can view delivery logs" on public.support_channel_delivery_logs;
create policy "Support staff can view delivery logs"
  on public.support_channel_delivery_logs
  for select
  to authenticated
  using (public.is_support_staff((select auth.uid())));

drop policy if exists support_channel_identities_select on public.support_channel_identities;
create policy support_channel_identities_select
  on public.support_channel_identities
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_support_staff((select auth.uid()))
  );

drop policy if exists support_channel_identities_update on public.support_channel_identities;
create policy support_channel_identities_update
  on public.support_channel_identities
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_support_staff((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    or public.is_support_staff((select auth.uid()))
  );

drop policy if exists support_channel_link_codes_select on public.support_channel_link_codes;
create policy support_channel_link_codes_select
  on public.support_channel_link_codes
  for select
  to authenticated
  using (user_id = (select auth.uid()));