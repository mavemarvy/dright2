
begin;

-- 1) Normalize marketplace product types and review metadata.
alter table public.products
  drop constraint if exists product_type_check;

alter table public.products
  add constraint product_type_check
  check (product_type = any (array['PHYSICAL'::text,'DIGITAL'::text,'SERVICE'::text,'COURSE'::text,'JOB'::text]));

alter table public.products
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- 2) Jobs get a moderation state independent of lifecycle status.
alter table public.jobs
  add column if not exists approval_status text not null default 'pending',
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.jobs drop constraint if exists jobs_approval_status_check;
alter table public.jobs
  add constraint jobs_approval_status_check
  check (approval_status = any (array['pending'::text,'approved'::text,'rejected'::text,'suspended'::text]));

-- Preserve listings that were already live before moderation existed.
update public.jobs
set approval_status='approved',
    reviewed_at=coalesce(reviewed_at,created_at)
where status='active' and approval_status='pending';

-- 3) Creator campaigns/tasks get an independent moderation state.
alter table public.cc_campaigns
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists moderation_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.cc_campaigns drop constraint if exists cc_campaigns_moderation_status_check;
alter table public.cc_campaigns
  add constraint cc_campaigns_moderation_status_check
  check (moderation_status = any (array['pending'::text,'approved'::text,'rejected'::text,'suspended'::text]));

update public.cc_campaigns
set moderation_status='approved',
    reviewed_at=coalesce(reviewed_at,created_at)
where status in ('active','paused') and moderation_status='pending';

-- 4) Promotion campaigns must also be reviewed. Preserve existing rows; change future default only.
alter table public.promotion_campaigns
  alter column moderation_status set default 'pending',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_moderation_status_check;
alter table public.promotion_campaigns
  add constraint promotion_campaigns_moderation_status_check
  check (moderation_status = any (array['pending'::text,'approved'::text,'rejected'::text,'suspended'::text]));

-- Immutable review history shared by every listing family.
create table if not exists public.listing_review_events (
  id uuid primary key default gen_random_uuid(),
  listing_kind text not null,
  listing_id uuid not null,
  owner_id uuid references auth.users(id) on delete set null,
  previous_status text,
  new_status text not null,
  decision text not null check (decision in ('approved','rejected','suspended','resubmitted')),
  reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.listing_review_events enable row level security;
drop policy if exists listing_review_events_owner_read on public.listing_review_events;
create policy listing_review_events_owner_read
on public.listing_review_events
for select to authenticated
using (
  owner_id=auth.uid()
  or public.is_admin(auth.uid())
);

create index if not exists listing_review_events_listing_idx
on public.listing_review_events(listing_kind,listing_id,created_at desc);

-- Central RBAC resolver. "review" means the role can see the queue.
create or replace function public.can_review_listing_kind(
  p_kind text,
  p_action text default 'review'
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_kind text:=lower(coalesce(p_kind,''));
  v_action text:=lower(coalesce(p_action,'review'));
begin
  if not public.is_admin(auth.uid()) then
    return false;
  end if;

  if v_kind in ('physical_product','digital_product','course','product','job_product') then
    if v_action='approve' then
      return public.has_dright_permission('products','approve')
        or public.has_dright_permission('marketplace','approve');
    elsif v_action='reject' then
      return public.has_dright_permission('products','reject')
        or public.has_dright_permission('products','review')
        or public.has_dright_permission('products','approve')
        or public.has_dright_permission('marketplace','reject');
    else
      return public.has_dright_permission('products','review')
        or public.has_dright_permission('products','approve')
        or public.has_dright_permission('products','reject')
        or public.has_dright_permission('marketplace','view');
    end if;
  elsif v_kind='service' then
    if v_action='approve' then
      return public.has_dright_permission('services','approve')
        or public.has_dright_permission('products','approve')
        or public.has_dright_permission('marketplace','approve');
    elsif v_action='reject' then
      return public.has_dright_permission('services','review')
        or public.has_dright_permission('services','approve')
        or public.has_dright_permission('products','reject')
        or public.has_dright_permission('marketplace','reject');
    else
      return public.has_dright_permission('services','review')
        or public.has_dright_permission('services','approve')
        or public.has_dright_permission('products','review')
        or public.has_dright_permission('marketplace','view');
    end if;
  elsif v_kind='job' then
    if v_action='approve' then
      return public.has_dright_permission('jobs','approve');
    elsif v_action='reject' then
      return public.has_dright_permission('jobs','reject')
        or public.has_dright_permission('jobs','review')
        or public.has_dright_permission('jobs','approve');
    else
      return public.has_dright_permission('jobs','review')
        or public.has_dright_permission('jobs','approve')
        or public.has_dright_permission('jobs','reject');
    end if;
  elsif v_kind in ('campaign','task','campaign_task') then
    if v_action='approve' then
      return public.has_dright_permission('campaigns','approve');
    elsif v_action='reject' then
      return public.has_dright_permission('campaigns','reject')
        or public.has_dright_permission('campaigns','review')
        or public.has_dright_permission('campaigns','approve');
    else
      return public.has_dright_permission('campaigns','review')
        or public.has_dright_permission('campaigns','approve')
        or public.has_dright_permission('campaigns','reject');
    end if;
  elsif v_kind='promotion_campaign' then
    if v_action='approve' then
      return public.has_dright_permission('campaigns','approve')
        or public.has_dright_permission('advertising','approve');
    elsif v_action='reject' then
      return public.has_dright_permission('campaigns','reject')
        or public.has_dright_permission('campaigns','review')
        or public.has_dright_permission('advertising','approve');
    else
      return public.has_dright_permission('campaigns','review')
        or public.has_dright_permission('campaigns','approve')
        or public.has_dright_permission('campaigns','reject')
        or public.has_dright_permission('advertising','approve');
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public.can_review_listing_kind(text,text) from public;
grant execute on function public.can_review_listing_kind(text,text) to authenticated;

-- Canonical kind helpers.
create or replace function public.product_listing_kind(p_type text)
returns text language sql immutable
set search_path=public,pg_temp
as $$
select case upper(coalesce(p_type,''))
  when 'PHYSICAL' then 'physical_product'
  when 'DIGITAL' then 'digital_product'
  when 'SERVICE' then 'service'
  when 'COURSE' then 'course'
  when 'JOB' then 'job_product'
  else 'product'
end
$$;

create or replace function public.cc_listing_kind(p_task_type text)
returns text language sql immutable
set search_path=public,pg_temp
as $$
select case
  when lower(coalesce(p_task_type,'')) like '%campaign%' then 'campaign'
  else 'task'
end
$$;

-- Server guard prevents self-approval and automatically requeues materially edited listings.
create or replace function public.guard_listing_moderation_state()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_uid uuid:=auth.uid();
  v_admin boolean:=public.is_admin(v_uid);
  v_kind text;
  v_content_changed boolean:=false;
  v_allowed boolean:=false;
begin
  if tg_table_name='products' then
    v_kind:=public.product_listing_kind(new.product_type);
    if tg_op='INSERT' then
      if v_role<>'service_role' and not v_admin then
        new.approval_status:='pending';
        new.rejection_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;
      return new;
    end if;

    if v_role<>'service_role' and not v_admin then
      v_content_changed :=
        new.name is distinct from old.name
        or new.description is distinct from old.description
        or new.price is distinct from old.price
        or new.image_url is distinct from old.image_url
        or new.category is distinct from old.category
        or new.product_type is distinct from old.product_type
        or new.demo_video_url is distinct from old.demo_video_url
        or new.is_free is distinct from old.is_free
        or new.tags is distinct from old.tags
        or new.brand is distinct from old.brand
        or new.condition is distinct from old.condition
        or new.specifications is distinct from old.specifications
        or new.faqs is distinct from old.faqs
        or new.location is distinct from old.location;

      if v_content_changed and old.approval_status in ('approved','rejected','pending') then
        new.approval_status:='pending';
        new.rejection_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;

      if new.approval_status is distinct from old.approval_status
         or new.rejection_reason is distinct from old.rejection_reason
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        if new.approval_status='pending' and old.uploaded_by=v_uid then
          new.rejection_reason:=null;
          new.reviewed_by:=null;
          new.reviewed_at:=null;
        else
          raise exception 'Listing moderation fields are admin-authoritative';
        end if;
      end if;
    elsif v_admin and (
      new.approval_status is distinct from old.approval_status
      or new.rejection_reason is distinct from old.rejection_reason
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) then
      v_allowed:=public.can_review_listing_kind(v_kind,'review');
      if not v_allowed then raise exception 'Missing listing review permission'; end if;
    end if;

    return new;
  end if;

  if tg_table_name='jobs' then
    v_kind:='job';
    if tg_op='INSERT' then
      if v_role<>'service_role' and not v_admin then
        new.approval_status:='pending';
        new.rejection_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;
      return new;
    end if;

    if v_role<>'service_role' and not v_admin then
      v_content_changed :=
        new.title is distinct from old.title
        or new.category is distinct from old.category
        or new.job_type is distinct from old.job_type
        or new.work_setup is distinct from old.work_setup
        or new.career_level is distinct from old.career_level
        or new.region is distinct from old.region
        or new.min_experience is distinct from old.min_experience
        or new.application_deadline is distinct from old.application_deadline
        or new.salary_min is distinct from old.salary_min
        or new.salary_max is distinct from old.salary_max
        or new.salary_currency is distinct from old.salary_currency
        or new.responsibilities is distinct from old.responsibilities
        or new.requirements is distinct from old.requirements
        or new.min_qualification is distinct from old.min_qualification
        or new.description is distinct from old.description
        or new.company_name is distinct from old.company_name
        or new.company_description is distinct from old.company_description
        or new.application_instructions is distinct from old.application_instructions;

      if v_content_changed and old.approval_status in ('approved','rejected','pending') then
        new.approval_status:='pending';
        new.rejection_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;

      if new.approval_status is distinct from old.approval_status
         or new.rejection_reason is distinct from old.rejection_reason
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        if new.approval_status='pending' and old.employer_id=v_uid then
          new.rejection_reason:=null;
          new.reviewed_by:=null;
          new.reviewed_at:=null;
        else
          raise exception 'Job moderation fields are admin-authoritative';
        end if;
      end if;
    elsif v_admin and (
      new.approval_status is distinct from old.approval_status
      or new.rejection_reason is distinct from old.rejection_reason
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) and not public.can_review_listing_kind('job','review') then
      raise exception 'Missing job review permission';
    end if;

    return new;
  end if;

  if tg_table_name='cc_campaigns' then
    v_kind:=public.cc_listing_kind(new.task_type);
    if tg_op='INSERT' then
      if v_role<>'service_role' and not v_admin then
        new.moderation_status:='pending';
        new.moderation_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;
      return new;
    end if;

    if v_role<>'service_role' and not v_admin then
      v_content_changed :=
        new.name is distinct from old.name
        or new.description is distinct from old.description
        or new.instructions is distinct from old.instructions
        or new.task_type is distinct from old.task_type
        or new.difficulty is distinct from old.difficulty
        or new.estimated_completion_time is distinct from old.estimated_completion_time
        or new.language is distinct from old.language
        or new.countries_allowed is distinct from old.countries_allowed
        or new.minimum_user_level is distinct from old.minimum_user_level
        or new.age_requirement is distinct from old.age_requirement
        or new.tags is distinct from old.tags
        or new.reward_per_completion is distinct from old.reward_per_completion
        or new.max_workers is distinct from old.max_workers
        or new.total_budget is distinct from old.total_budget
        or new.verification_type is distinct from old.verification_type
        or new.evidence_types is distinct from old.evidence_types
        or new.requirements is distinct from old.requirements;

      if v_content_changed and old.moderation_status in ('approved','rejected','pending') then
        new.moderation_status:='pending';
        new.moderation_reason:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;

      if new.moderation_status is distinct from old.moderation_status
         or new.moderation_reason is distinct from old.moderation_reason
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        if new.moderation_status='pending' and old.creator_id=v_uid then
          new.moderation_reason:=null;
          new.reviewed_by:=null;
          new.reviewed_at:=null;
        else
          raise exception 'Campaign moderation fields are admin-authoritative';
        end if;
      end if;
    elsif v_admin and (
      new.moderation_status is distinct from old.moderation_status
      or new.moderation_reason is distinct from old.moderation_reason
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) and not public.can_review_listing_kind(v_kind,'review') then
      raise exception 'Missing campaign review permission';
    end if;

    return new;
  end if;

  if tg_table_name='promotion_campaigns' then
    v_kind:='promotion_campaign';

    if tg_op='INSERT' and v_role<>'service_role' and not v_admin then
      new.moderation_status:='pending';
      new.admin_notes:=null;
      new.reviewed_by:=null;
      new.reviewed_at:=null;
    elsif tg_op='UPDATE' and v_role<>'service_role' and not v_admin then
      v_content_changed :=
        new.goal is distinct from old.goal
        or new.audience_type is distinct from old.audience_type
        or new.audience_country is distinct from old.audience_country
        or new.audience_state is distinct from old.audience_state
        or new.audience_city is distinct from old.audience_city
        or new.audience_category is distinct from old.audience_category
        or new.audience_interests is distinct from old.audience_interests
        or new.audience_followers_only is distinct from old.audience_followers_only
        or new.placements is distinct from old.placements
        or new.tier_code is distinct from old.tier_code;

      if v_content_changed and old.moderation_status in ('approved','rejected','pending') then
        new.moderation_status:='pending';
        new.admin_notes:=null;
        new.reviewed_by:=null;
        new.reviewed_at:=null;
      end if;

      if new.moderation_status is distinct from old.moderation_status
         or new.admin_notes is distinct from old.admin_notes
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        if new.moderation_status='pending' and old.seller_id=v_uid then
          new.admin_notes:=null;
          new.reviewed_by:=null;
          new.reviewed_at:=null;
        else
          raise exception 'Promotion moderation fields are admin-authoritative';
        end if;
      end if;
    elsif tg_op='UPDATE' and v_admin and (
      new.moderation_status is distinct from old.moderation_status
      or new.admin_notes is distinct from old.admin_notes
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) and not public.can_review_listing_kind('promotion_campaign','review') then
      raise exception 'Missing promotion review permission';
    end if;

    if new.status='active' and new.moderation_status<>'approved' then
      raise exception 'Promotion campaign must be approved before activation';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listing_moderation_guard on public.products;
create trigger trg_listing_moderation_guard
before insert or update on public.products
for each row execute function public.guard_listing_moderation_state();

drop trigger if exists trg_listing_moderation_guard on public.jobs;
create trigger trg_listing_moderation_guard
before insert or update on public.jobs
for each row execute function public.guard_listing_moderation_state();

drop trigger if exists trg_listing_moderation_guard on public.cc_campaigns;
create trigger trg_listing_moderation_guard
before insert or update on public.cc_campaigns
for each row execute function public.guard_listing_moderation_state();

drop trigger if exists trg_aa_listing_moderation_guard on public.promotion_campaigns;
create trigger trg_aa_listing_moderation_guard
before insert or update on public.promotion_campaigns
for each row execute function public.guard_listing_moderation_state();

-- Changes to product detail/media data also require a new review.
create or replace function public.requeue_product_after_related_edit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_product_id uuid;
begin
  if coalesce(auth.role(),'')='service_role' or public.is_admin(auth.uid()) then
    return coalesce(new,old);
  end if;

  v_product_id:=coalesce(
    case when tg_op<>'DELETE' then new.product_id else null end,
    case when tg_op<>'INSERT' then old.product_id else null end
  );

  if v_product_id is not null then
    update public.products
    set approval_status='pending',
        rejection_reason=null,
        reviewed_by=null,
        reviewed_at=null
    where id=v_product_id
      and uploaded_by=auth.uid()
      and approval_status in ('approved','rejected');
  end if;

  return coalesce(new,old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'product_images','digital_product_details','service_product_details',
    'service_tiers','customization_options','portfolio_items'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_requeue_product_review on public.%I',t);
      execute format(
        'create trigger trg_requeue_product_review after insert or update or delete on public.%I for each row execute function public.requeue_product_after_related_edit()',
        t
      );
    end if;
  end loop;
end $$;

-- 5) Correct RLS visibility and admin authority.
drop policy if exists "Admins can view all products" on public.products;
create policy "Authorized reviewers can view all products"
on public.products for select to authenticated
using (
  public.can_review_listing_kind(public.product_listing_kind(product_type),'review')
);

drop policy if exists "Admins can approve products" on public.products;
create policy "Authorized reviewers can update products"
on public.products for update to authenticated
using (
  public.can_review_listing_kind(public.product_listing_kind(product_type),'review')
)
with check (
  public.can_review_listing_kind(public.product_listing_kind(product_type),'review')
);

drop policy if exists public_read_jobs on public.jobs;
create policy public_read_approved_jobs
on public.jobs for select to anon,authenticated
using (approval_status='approved' and status='active');

drop policy if exists admin_read_jobs on public.jobs;
create policy admin_read_jobs
on public.jobs for select to authenticated
using (
  employer_id=auth.uid()
  or public.can_review_listing_kind('job','review')
);

drop policy if exists admin_update_jobs on public.jobs;
create policy admin_update_jobs
on public.jobs for update to authenticated
using (public.can_review_listing_kind('job','review'))
with check (public.can_review_listing_kind('job','review'));

drop policy if exists select_cc_cmp on public.cc_campaigns;
create policy select_cc_cmp
on public.cc_campaigns for select to authenticated
using (
  (moderation_status='approved' and status in ('active','paused'))
  or creator_id=auth.uid()
  or public.can_review_listing_kind(public.cc_listing_kind(task_type),'review')
);

drop policy if exists upd_own_cc_cmp on public.cc_campaigns;
create policy upd_own_cc_cmp
on public.cc_campaigns for update to authenticated
using (
  creator_id=auth.uid()
  or public.can_review_listing_kind(public.cc_listing_kind(task_type),'review')
)
with check (
  creator_id=auth.uid()
  or public.can_review_listing_kind(public.cc_listing_kind(task_type),'review')
);

drop policy if exists del_own_cc_cmp on public.cc_campaigns;
create policy del_own_cc_cmp
on public.cc_campaigns for delete to authenticated
using (
  creator_id=auth.uid()
  or public.can_review_listing_kind(public.cc_listing_kind(task_type),'review')
);

drop policy if exists select_own_campaigns on public.promotion_campaigns;
create policy select_own_campaigns
on public.promotion_campaigns for select to authenticated
using (
  auth.uid()=seller_id
  or public.can_review_listing_kind('promotion_campaign','review')
  or public.has_dright_permission('campaigns','manage')
);

drop policy if exists update_own_campaigns on public.promotion_campaigns;
create policy update_own_campaigns
on public.promotion_campaigns for update to authenticated
using (
  auth.uid()=seller_id
  or public.can_review_listing_kind('promotion_campaign','review')
  or public.has_dright_permission('campaigns','manage')
)
with check (
  auth.uid()=seller_id
  or public.can_review_listing_kind('promotion_campaign','review')
  or public.has_dright_permission('campaigns','manage')
);

-- 6) Prevent direct-ID usage of listings that did not pass moderation.
create or replace function public.guard_job_application_approved_listing()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(
    select 1 from public.jobs j
    where j.id=new.job_id and j.approval_status='approved' and j.status='active'
  ) then
    raise exception 'This job is not open for applications';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_job_application_approved_listing on public.job_applications;
create trigger trg_guard_job_application_approved_listing
before insert or update of job_id on public.job_applications
for each row execute function public.guard_job_application_approved_listing();

create or replace function public.guard_cc_submission_approved_campaign()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(
    select 1 from public.cc_campaigns c
    where c.id=new.campaign_id and c.moderation_status='approved' and c.status='active'
  ) then
    raise exception 'This campaign/task is not open for submissions';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_cc_submission_approved_campaign on public.cc_submissions;
create trigger trg_guard_cc_submission_approved_campaign
before insert or update of campaign_id on public.cc_submissions
for each row execute function public.guard_cc_submission_approved_campaign();

create or replace function public.guard_order_approved_product()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.product_id is not null and not exists(
    select 1 from public.products p
    where p.id=new.product_id
      and p.approval_status='approved'
      and p.is_active=true
      and p.is_hidden=false
  ) then
    raise exception 'This listing is not available for purchase';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_order_approved_product on public.orders;
create trigger trg_guard_order_approved_product
before insert or update of product_id on public.orders
for each row execute function public.guard_order_approved_product();

drop trigger if exists trg_guard_guest_order_approved_product on public.guest_orders;
create trigger trg_guard_guest_order_approved_product
before insert or update of product_id on public.guest_orders
for each row execute function public.guard_order_approved_product();

-- 7) Unified admin review queue.
create or replace function public.get_admin_listing_review_queue(
  p_status text default 'pending',
  p_listing_type text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  listing_type text,
  source_table text,
  id uuid,
  owner_id uuid,
  title text,
  description text,
  status text,
  rejection_reason text,
  category text,
  amount numeric,
  currency text,
  created_at timestamptz,
  reviewed_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;

  return query
  with queue as (
    select
      public.product_listing_kind(p.product_type) as listing_type,
      'products'::text as source_table,
      p.id,p.uploaded_by as owner_id,p.name as title,p.description,
      p.approval_status as status,p.rejection_reason,p.category,
      p.price as amount,null::text as currency,p.created_at,p.reviewed_at,
      jsonb_build_object(
        'product_type',p.product_type,'image_url',p.image_url,'is_free',p.is_free,
        'stock_quantity',p.stock_quantity,'is_active',p.is_active,'is_hidden',p.is_hidden,
        'commission_rate',p.commission_rate,'average_rating',p.average_rating,'total_sales',p.total_sales
      ) as metadata
    from public.products p
    where public.can_review_listing_kind(public.product_listing_kind(p.product_type),'review')

    union all

    select
      'job'::text,'jobs'::text,j.id,j.employer_id,j.title,j.description,
      j.approval_status,j.rejection_reason,j.category,
      j.salary_max::numeric,j.salary_currency,j.created_at,j.reviewed_at,
      jsonb_build_object(
        'job_type',j.job_type,'work_setup',j.work_setup,'career_level',j.career_level,
        'region',j.region,'company_name',j.company_name,'salary_min',j.salary_min,
        'salary_max',j.salary_max,'lifecycle_status',j.status,'application_deadline',j.application_deadline
      )
    from public.jobs j
    where public.can_review_listing_kind('job','review')

    union all

    select
      public.cc_listing_kind(c.task_type),'cc_campaigns'::text,c.id,c.creator_id,c.name,c.description,
      c.moderation_status,c.moderation_reason,null::text,
      c.reward_per_completion,null::text,c.created_at,c.reviewed_at,
      jsonb_build_object(
        'task_type',c.task_type,'difficulty',c.difficulty,'verification_type',c.verification_type,
        'evidence_types',c.evidence_types,'max_workers',c.max_workers,'workers_count',c.workers_count,
        'total_budget',c.total_budget,'lifecycle_status',c.status,'launched_at',c.launched_at
      )
    from public.cc_campaigns c
    where public.can_review_listing_kind(public.cc_listing_kind(c.task_type),'review')

    union all

    select
      'promotion_campaign'::text,'promotion_campaigns'::text,pc.id,pc.seller_id,
      ('Promotion for '||pc.listing_type||' '||left(pc.listing_id::text,8))::text,
      ('Goal: '||replace(pc.goal,'_',' '))::text,
      pc.moderation_status,pc.admin_notes,pc.audience_category,
      pc.total_payable,pc.billing_currency,pc.created_at,pc.reviewed_at,
      jsonb_build_object(
        'listing_id',pc.listing_id,'listing_type',pc.listing_type,'goal',pc.goal,
        'budget',pc.budget,'payment_status',pc.payment_status,'lifecycle_status',pc.status,
        'placements',pc.placements,'tier_code',pc.tier_code,'quality_score',pc.quality_score
      )
    from public.promotion_campaigns pc
    where public.can_review_listing_kind('promotion_campaign','review')
  )
  select q.*
  from queue q
  where (p_status is null or lower(p_status)='all' or q.status=lower(p_status))
    and (p_listing_type is null or lower(p_listing_type)='all' or q.listing_type=lower(p_listing_type))
  order by q.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.get_admin_listing_review_queue(text,text,integer,integer) from public;
grant execute on function public.get_admin_listing_review_queue(text,text,integer,integer) to authenticated;

-- 8) Authoritative review operation with validation, audit history and user notification.
create or replace function public.review_dright_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_requested_kind text:=lower(coalesce(p_listing_type,''));
  v_kind text;
  v_decision text:=lower(coalesce(p_decision,''));
  v_owner uuid;
  v_title text;
  v_previous text;
  v_new text;
  v_event_id uuid;
  v_action_url text;
  v_category text:='marketplace';
  v_snapshot jsonb:='{}'::jsonb;
  v_ptype text;
  v_payment_status text;
  v_status text;
  v_listing_id uuid;
begin
  if v_decision not in ('approve','reject','approved','rejected') then
    raise exception 'Decision must be approve or reject';
  end if;
  v_decision:=case when v_decision like 'approve%' then 'approved' else 'rejected' end;

  if v_requested_kind in ('product','physical_product','digital_product','service','course','job_product') then
    select public.product_listing_kind(p.product_type),p.product_type,p.uploaded_by,p.name,p.approval_status,
           jsonb_build_object('product_type',p.product_type,'category',p.category,'price',p.price,'image_url',p.image_url)
    into v_kind,v_ptype,v_owner,v_title,v_previous,v_snapshot
    from public.products p where p.id=p_listing_id;

    if v_owner is null then raise exception 'Listing not found'; end if;
    if not public.can_review_listing_kind(v_kind,case when v_decision='approved' then 'approve' else 'reject' end) then
      raise exception 'Missing permission for this listing review';
    end if;

    if v_decision='approved' then
      if nullif(btrim(v_title),'') is null then raise exception 'Listing title is required'; end if;
      if not exists(select 1 from public.products p where p.id=p_listing_id and p.price>=0 and nullif(p.image_url,'') is not null) then
        raise exception 'Listing requires a valid price and at least one image';
      end if;
      if v_ptype in ('DIGITAL','COURSE') and not exists(
        select 1 from public.digital_product_details d where d.product_id=p_listing_id
      ) then
        raise exception 'Digital/course delivery details are missing';
      end if;
      if v_ptype='SERVICE' and (
        not exists(select 1 from public.service_product_details d where d.product_id=p_listing_id)
        or not exists(select 1 from public.service_tiers t where t.product_id=p_listing_id)
      ) then
        raise exception 'Service details and at least one service tier are required';
      end if;

      update public.products
      set approval_status='approved',rejection_reason=null,reviewed_by=auth.uid(),reviewed_at=now(),
          is_active=true,is_hidden=false
      where id=p_listing_id;
      v_new:='approved';
    else
      if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A rejection reason is required'; end if;
      update public.products
      set approval_status='rejected',rejection_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now(),
          is_active=false
      where id=p_listing_id;
      v_new:='rejected';
    end if;

    v_action_url:='/product/'||p_listing_id::text;
    v_category:='marketplace';

  elsif v_requested_kind='job' then
    v_kind:='job';
    select j.employer_id,j.title,j.approval_status,
           jsonb_build_object('category',j.category,'job_type',j.job_type,'company_name',j.company_name,'region',j.region)
    into v_owner,v_title,v_previous,v_snapshot
    from public.jobs j where j.id=p_listing_id;

    if v_owner is null then raise exception 'Job not found'; end if;
    if not public.can_review_listing_kind('job',case when v_decision='approved' then 'approve' else 'reject' end) then
      raise exception 'Missing job review permission';
    end if;

    if v_decision='approved' then
      if not exists(
        select 1 from public.jobs j
        where j.id=p_listing_id
          and nullif(btrim(j.title),'') is not null
          and nullif(btrim(j.description),'') is not null
          and nullif(btrim(j.company_name),'') is not null
          and nullif(btrim(j.region),'') is not null
      ) then raise exception 'Job is missing required listing information'; end if;

      update public.jobs
      set approval_status='approved',rejection_reason=null,reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_listing_id;
      v_new:='approved';
    else
      if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A rejection reason is required'; end if;
      update public.jobs
      set approval_status='rejected',rejection_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_listing_id;
      v_new:='rejected';
    end if;

    v_action_url:='/jobs/'||p_listing_id::text;
    v_category:='jobs';

  elsif v_requested_kind in ('campaign','task','campaign_task') then
    select public.cc_listing_kind(c.task_type),c.creator_id,c.name,c.moderation_status,
           jsonb_build_object('task_type',c.task_type,'reward_per_completion',c.reward_per_completion,
                              'max_workers',c.max_workers,'verification_type',c.verification_type,
                              'evidence_types',c.evidence_types)
    into v_kind,v_owner,v_title,v_previous,v_snapshot
    from public.cc_campaigns c where c.id=p_listing_id;

    if v_owner is null then raise exception 'Campaign/task not found'; end if;
    if not public.can_review_listing_kind(v_kind,case when v_decision='approved' then 'approve' else 'reject' end) then
      raise exception 'Missing campaign review permission';
    end if;

    if v_decision='approved' then
      if not exists(
        select 1 from public.cc_campaigns c
        where c.id=p_listing_id
          and nullif(btrim(c.name),'') is not null
          and c.reward_per_completion>0
          and (c.max_workers is null or c.max_workers>0)
          and cardinality(coalesce(c.evidence_types,array[]::text[]))>0
      ) then raise exception 'Campaign/task is missing reward, evidence, or required listing information'; end if;

      update public.cc_campaigns
      set moderation_status='approved',moderation_reason=null,reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_listing_id;
      v_new:='approved';
    else
      if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A rejection reason is required'; end if;
      update public.cc_campaigns
      set moderation_status='rejected',moderation_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_listing_id;
      v_new:='rejected';
    end if;

    v_action_url:='/creator-campaigns/'||p_listing_id::text;
    v_category:='promotions';

  elsif v_requested_kind='promotion_campaign' then
    v_kind:='promotion_campaign';
    select pc.seller_id,('Promotion '||left(pc.id::text,8))::text,pc.moderation_status,
           pc.payment_status,pc.status,
           jsonb_build_object('listing_id',pc.listing_id,'listing_type',pc.listing_type,'goal',pc.goal,
                              'budget',pc.budget,'total_payable',pc.total_payable,'payment_status',pc.payment_status)
    into v_owner,v_title,v_previous,v_payment_status,v_status,v_snapshot
    from public.promotion_campaigns pc where pc.id=p_listing_id;

    if v_owner is null then raise exception 'Promotion campaign not found'; end if;
    if not public.can_review_listing_kind('promotion_campaign',case when v_decision='approved' then 'approve' else 'reject' end) then
      raise exception 'Missing promotion review permission';
    end if;

    if v_decision='approved' then
      if not exists(
        select 1
        from public.promotion_campaigns pc
        where pc.id=p_listing_id
          and (
            (lower(pc.listing_type) in ('product','service','course')
             and exists(select 1 from public.products p
                        where p.id=pc.listing_id and p.approval_status='approved' and p.is_active=true and p.is_hidden=false))
            or
            (lower(pc.listing_type)='job'
             and exists(select 1 from public.jobs j
                        where j.id=pc.listing_id and j.approval_status='approved' and j.status='active'))
            or
            (lower(pc.listing_type) in ('campaign','task')
             and exists(select 1 from public.cc_campaigns c
                        where c.id=pc.listing_id and c.moderation_status='approved' and c.status='active'))
          )
      ) then raise exception 'The promoted listing must be approved and active first'; end if;

      update public.promotion_campaigns
      set moderation_status='approved',admin_notes=null,reviewed_by=auth.uid(),reviewed_at=now(),
          status=case
            when payment_status='paid' and end_date>now() and actual_spend<budget then 'active'
            else status
          end
      where id=p_listing_id;
      v_new:='approved';
    else
      if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A rejection reason is required'; end if;
      update public.promotion_campaigns
      set moderation_status='rejected',admin_notes=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now(),
          status='rejected'
      where id=p_listing_id;
      v_new:='rejected';
    end if;

    v_action_url:='/promote';
    v_category:='promotions';
  else
    raise exception 'Unsupported listing type';
  end if;

  insert into public.listing_review_events(
    listing_kind,listing_id,owner_id,previous_status,new_status,decision,reason,reviewed_by,snapshot
  ) values(
    v_kind,p_listing_id,v_owner,v_previous,v_new,v_new,
    case when v_new='rejected' then btrim(p_reason) else null end,
    auth.uid(),v_snapshot
  )
  returning id into v_event_id;

  insert into public.admin_activity_logs(
    admin_id,action,target_type,target_id,resource_type,resource_id,details
  ) values(
    auth.uid(),'listing_'||v_new,v_kind,p_listing_id::text,v_kind,p_listing_id,
    jsonb_build_object('previous_status',v_previous,'new_status',v_new,'reason',p_reason,'review_event_id',v_event_id)
  );

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  ) values(
    v_owner,
    case when v_new='approved' then 'Listing approved' else 'Listing needs changes' end,
    case when v_new='approved'
      then coalesce(v_title,'Your listing')||' was approved and can now be shown on DRIGHT.'
      else coalesce(v_title,'Your listing')||' was not approved. Reason: '||btrim(p_reason)
    end,
    'system_alert',p_listing_id,v_category,'high',
    jsonb_build_object(
      'event_module','listing_verification','event_type','listing_'||v_new,
      'listing_type',v_kind,'listing_id',p_listing_id,'review_event_id',v_event_id,
      'reason',case when v_new='rejected' then btrim(p_reason) else null end,
      'action_url',v_action_url
    ),
    'listing-review:'||v_event_id::text,false,false,false
  );

  return jsonb_build_object(
    'success',true,'listing_type',v_kind,'listing_id',p_listing_id,
    'previous_status',v_previous,'status',v_new,'review_event_id',v_event_id
  );
end;
$$;

revoke all on function public.review_dright_listing(text,uuid,text,text) from public;
grant execute on function public.review_dright_listing(text,uuid,text,text) to authenticated;

commit;
