
alter table public.business_settings
  add column if not exists public_footer_visible boolean not null default true;

comment on column public.business_settings.public_footer_visible is
  'Controls whether the public NAP/business-information footer is rendered. Business data is retained when hidden.';

insert into public.permissions (module, action, label, description, is_active, is_deleted)
values (
  'site_settings',
  'manage',
  'Manage Site Settings',
  'Manage public site configuration, including business-information/footer visibility.',
  true,
  false
)
on conflict (module, action) do update
set label = excluded.label,
    description = excluded.description,
    is_active = true,
    is_deleted = false,
    updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.module = 'site_settings'
 and p.action = 'manage'
where r.slug in ('super_admin','platform_admin','localization_admin','system_config_admin')
  and r.is_deleted = false
  and r.is_archived = false
on conflict (role_id, permission_id) do nothing;

drop policy if exists "admin_insert_business_settings" on public.business_settings;
drop policy if exists "admin_update_business_settings" on public.business_settings;
drop policy if exists "admin_delete_business_settings" on public.business_settings;

create policy "admin_insert_business_settings"
on public.business_settings
for insert
to authenticated
with check (public.has_dright_permission('site_settings','manage'));

create policy "admin_update_business_settings"
on public.business_settings
for update
to authenticated
using (public.has_dright_permission('site_settings','manage'))
with check (public.has_dright_permission('site_settings','manage'));

create policy "admin_delete_business_settings"
on public.business_settings
for delete
to authenticated
using (public.has_dright_permission('site_settings','manage'));
