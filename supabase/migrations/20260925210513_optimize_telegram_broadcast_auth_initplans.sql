drop policy if exists "Admins manage telegram broadcast chats" on public.telegram_broadcast_chats;
create policy "Admins manage telegram broadcast chats" on public.telegram_broadcast_chats
for all to authenticated
using (
  coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true'
  and (select public.is_admin_user())
)
with check (
  coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true'
  and (select public.is_admin_user())
);

drop policy if exists "Admins manage telegram broadcast subscribers" on public.telegram_broadcast_subscribers;
create policy "Admins manage telegram broadcast subscribers" on public.telegram_broadcast_subscribers
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram broadcast join requests" on public.telegram_broadcast_join_requests;
create policy "Admins manage telegram broadcast join requests" on public.telegram_broadcast_join_requests
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram broadcast welcome messages" on public.telegram_broadcast_welcome_messages;
create policy "Admins manage telegram broadcast welcome messages" on public.telegram_broadcast_welcome_messages
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram broadcast campaigns" on public.telegram_broadcast_campaigns;
create policy "Admins manage telegram broadcast campaigns" on public.telegram_broadcast_campaigns
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram broadcast deliveries" on public.telegram_broadcast_deliveries;
create policy "Admins manage telegram broadcast deliveries" on public.telegram_broadcast_deliveries
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram moderation events" on public.telegram_broadcast_moderation_events;
create policy "Admins manage telegram moderation events" on public.telegram_broadcast_moderation_events
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));

drop policy if exists "Admins manage telegram broadcast settings" on public.telegram_broadcast_settings;
create policy "Admins manage telegram broadcast settings" on public.telegram_broadcast_settings
for all to authenticated
using (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()))
with check (coalesce(((select auth.jwt())->>'is_anonymous'),'false') <> 'true' and (select public.is_admin_user()));
