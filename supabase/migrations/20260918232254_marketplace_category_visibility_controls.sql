
begin;

create table if not exists public.marketplace_categories (
  id text primary key,
  name text not null,
  icon text not null default 'Package',
  color text not null default 'bg-primary-500',
  subcategories text[] not null default array[]::text[],
  popular boolean not null default false,
  is_visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.marketplace_ui_settings (
  key text primary key,
  categories_section_visible boolean not null default true,
  categories_default_collapsed boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.marketplace_categories
  (id,name,icon,color,subcategories,popular,is_visible,sort_order)
values
  ('electronics','Electronics','Smartphone','bg-blue-500',array['Phones','Laptops','Cameras','Audio','Accessories','Gaming'],true,true,10),
  ('fashion','Fashion','Shirt','bg-pink-500',array['Men','Women','Kids','Shoes','Bags','Jewelry','Watches'],true,false,20),
  ('digital','Digital Products','Download','bg-purple-500',array['E-books','Templates','Software','AI Tools','Prompt Packs','Plugins'],true,true,30),
  ('courses','Courses','GraduationCap','bg-indigo-500',array['Programming','Design','Marketing','Business','Photography','Music'],true,true,40),
  ('services','Services','Sparkles','bg-teal-500',array['Graphic Design','Video Editing','Writing','SEO','Consulting','Voiceover'],true,true,50),
  ('jobs','Jobs','Briefcase','bg-orange-500',array['Full-time','Part-time','Freelance','Remote','Contract','Internship'],false,true,60),
  ('software','Software','Code','bg-cyan-500',array['SaaS','Desktop Apps','Mobile Apps','Scripts','APIs'],false,false,70),
  ('marketing','Marketing','Megaphone','bg-rose-500',array['Social Media','Email Marketing','Content','PPC','Branding'],false,false,80),
  ('health','Health & Beauty','Heart','bg-red-500',array['Skincare','Supplements','Fitness','Wellness','Cosmetics'],false,true,90),
  ('home','Home & Garden','Home','bg-green-500',array['Furniture','Decor','Appliances','Garden','Kitchen'],false,false,100),
  ('agriculture','Agriculture','Sprout','bg-lime-600',array['Seeds','Equipment','Produce','Livestock','Tools'],false,false,110),
  ('gaming','Gaming','Gamepad2','bg-violet-500',array['Consoles','Games','Accessories','Accounts','In-game Items'],false,false,120),
  ('books','Books & Media','BookOpen','bg-amber-600',array['E-books','Audiobooks','Comics','Magazines','Music'],false,false,130),
  ('music','Music','Music','bg-fuchsia-500',array['Beats','Samples','Courses','Production','Instruments'],false,false,140),
  ('education','Education','GraduationCap','bg-sky-600',array['Tutoring','Certifications','Study Materials','Training'],false,false,150),
  ('business','Business','Building2','bg-slate-600',array['Business Plans','Legal Docs','Accounting','Templates'],false,true,160),
  ('accessories','Accessories','Watch','bg-stone-500',array['Watches','Bags','Jewelry','Sunglasses','Belts'],false,false,170),
  ('freelancing','Freelancing','Laptop','bg-emerald-500',array['Development','Design','Writing','Translation','Virtual Assistant'],false,false,180),
  ('cars','Cars','Car','bg-zinc-700',array['Cars','Motorcycles','Parts','Accessories'],false,false,190),
  ('real-estate','Real Estate','Building','bg-gray-600',array['For Sale','For Rent','Land','Commercial','Short Let'],false,false,200)
on conflict (id) do update set
  name=excluded.name,
  icon=excluded.icon,
  color=excluded.color,
  subcategories=excluded.subcategories,
  popular=excluded.popular,
  sort_order=excluded.sort_order;

insert into public.marketplace_ui_settings(
  key,categories_section_visible,categories_default_collapsed
) values ('default',true,true)
on conflict (key) do nothing;

alter table public.marketplace_categories enable row level security;
alter table public.marketplace_ui_settings enable row level security;

drop policy if exists marketplace_categories_public_read on public.marketplace_categories;
create policy marketplace_categories_public_read
on public.marketplace_categories
for select
to anon,authenticated
using (
  is_visible=true
  or (
    auth.uid() is not null
    and public.has_dright_permission('marketplace','manage_categories')
  )
);

drop policy if exists marketplace_ui_settings_public_read on public.marketplace_ui_settings;
create policy marketplace_ui_settings_public_read
on public.marketplace_ui_settings
for select
to anon,authenticated
using (true);

revoke insert,update,delete on public.marketplace_categories from anon,authenticated;
revoke insert,update,delete on public.marketplace_ui_settings from anon,authenticated;
grant select on public.marketplace_categories to anon,authenticated;
grant select on public.marketplace_ui_settings to anon,authenticated;

create or replace function public.set_marketplace_category_visibility(
  p_category_id text,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_name text;
begin
  if auth.uid() is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Missing marketplace category management permission';
  end if;

  update public.marketplace_categories
  set is_visible=p_visible,
      updated_at=now(),
      updated_by=auth.uid()
  where id=p_category_id
  returning name into v_name;

  if v_name is null then
    raise exception 'Marketplace category not found';
  end if;

  insert into public.admin_activity_logs(
    admin_id,action,target_type,target_id,resource_type,resource_id,details
  ) values (
    auth.uid(),
    case when p_visible then 'marketplace_category_shown' else 'marketplace_category_hidden' end,
    'marketplace_category',
    p_category_id,
    'marketplace_category',
    null,
    jsonb_build_object('category_id',p_category_id,'name',v_name,'is_visible',p_visible)
  );

  return jsonb_build_object(
    'success',true,'category_id',p_category_id,'name',v_name,'is_visible',p_visible
  );
end;
$$;

create or replace function public.set_marketplace_category_section(
  p_visible boolean,
  p_default_collapsed boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Missing marketplace category management permission';
  end if;

  insert into public.marketplace_ui_settings(
    key,categories_section_visible,categories_default_collapsed,updated_at,updated_by
  ) values (
    'default',p_visible,p_default_collapsed,now(),auth.uid()
  )
  on conflict (key) do update set
    categories_section_visible=excluded.categories_section_visible,
    categories_default_collapsed=excluded.categories_default_collapsed,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by;

  insert into public.admin_activity_logs(
    admin_id,action,target_type,target_id,resource_type,resource_id,details
  ) values (
    auth.uid(),
    'marketplace_category_section_updated',
    'marketplace_ui_settings',
    'default',
    'marketplace_ui_settings',
    null,
    jsonb_build_object(
      'categories_section_visible',p_visible,
      'categories_default_collapsed',p_default_collapsed
    )
  );

  return jsonb_build_object(
    'success',true,
    'categories_section_visible',p_visible,
    'categories_default_collapsed',p_default_collapsed
  );
end;
$$;

revoke all on function public.set_marketplace_category_visibility(text,boolean) from public;
revoke all on function public.set_marketplace_category_section(boolean,boolean) from public;
grant execute on function public.set_marketplace_category_visibility(text,boolean) to authenticated;
grant execute on function public.set_marketplace_category_section(boolean,boolean) to authenticated;

commit;
