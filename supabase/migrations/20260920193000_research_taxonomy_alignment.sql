begin;

alter table public.marketplace_taxonomy_categories
  add column if not exists synonyms text[] not null default '{}'::text[],
  add column if not exists form_template_key text,
  add column if not exists moderation_tier text not null default 'standard',
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists external_mappings jsonb not null default '{}'::jsonb;

create or replace function public.get_marketplace_category_tree_v2(p_listing_type_code text)
returns table (
  id uuid,
  listing_type_code text,
  parent_id uuid,
  name text,
  slug text,
  description text,
  icon text,
  image_url text,
  sort_order integer,
  is_leaf boolean,
  synonyms text[],
  form_template_key text,
  moderation_tier text,
  depth integer,
  path_ids uuid[],
  path_names text[],
  has_children boolean
)
language sql stable security invoker set search_path=public
as $$
  with recursive tree as (
    select c.id,c.listing_type_code,c.parent_id,c.name,c.slug,c.description,c.icon,c.image_url,
           c.sort_order,c.is_leaf,c.synonyms,c.form_template_key,c.moderation_tier,
           0::integer as depth,array[c.id]::uuid[] as path_ids,array[c.name]::text[] as path_names
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code=upper(trim(p_listing_type_code))
      and c.parent_id is null and c.is_active=true
    union all
    select child.id,child.listing_type_code,child.parent_id,child.name,child.slug,child.description,child.icon,child.image_url,
           child.sort_order,child.is_leaf,child.synonyms,child.form_template_key,child.moderation_tier,
           parent.depth+1,parent.path_ids||child.id,parent.path_names||child.name
    from public.marketplace_taxonomy_categories child
    join tree parent on parent.id=child.parent_id
    where child.is_active=true and child.listing_type_code=upper(trim(p_listing_type_code))
  )
  select t.id,t.listing_type_code,t.parent_id,t.name,t.slug,t.description,t.icon,t.image_url,
         t.sort_order,t.is_leaf,t.synonyms,t.form_template_key,t.moderation_tier,t.depth,t.path_ids,t.path_names,
         exists(select 1 from public.marketplace_taxonomy_categories child where child.parent_id=t.id and child.is_active=true)
  from tree t
  order by t.path_names,t.sort_order,t.name;
$$;

revoke all on function public.get_marketplace_category_tree_v2(text) from public;
grant execute on function public.get_marketplace_category_tree_v2(text) to anon,authenticated,service_role;

create or replace function public.admin_get_marketplace_taxonomy_tree_v2(p_listing_type_code text)
returns table (
  id uuid,
  listing_type_code text,
  parent_id uuid,
  name text,
  slug text,
  description text,
  icon text,
  image_url text,
  sort_order integer,
  is_leaf boolean,
  is_active boolean,
  synonyms text[],
  form_template_key text,
  moderation_tier text,
  depth integer,
  path_ids uuid[],
  path_names text[],
  has_children boolean
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  return query
  with recursive tree as (
    select c.id,c.listing_type_code,c.parent_id,c.name,c.slug,c.description,c.icon,c.image_url,
           c.sort_order,c.is_leaf,c.is_active,c.synonyms,c.form_template_key,c.moderation_tier,
           0::integer as depth,array[c.id]::uuid[] as path_ids,array[c.name]::text[] as path_names
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code=upper(trim(p_listing_type_code)) and c.parent_id is null
    union all
    select child.id,child.listing_type_code,child.parent_id,child.name,child.slug,child.description,child.icon,child.image_url,
           child.sort_order,child.is_leaf,child.is_active,child.synonyms,child.form_template_key,child.moderation_tier,
           parent.depth+1,parent.path_ids||child.id,parent.path_names||child.name
    from public.marketplace_taxonomy_categories child
    join tree parent on parent.id=child.parent_id
    where child.listing_type_code=upper(trim(p_listing_type_code))
  )
  select t.id,t.listing_type_code,t.parent_id,t.name,t.slug,t.description,t.icon,t.image_url,
         t.sort_order,t.is_leaf,t.is_active,t.synonyms,t.form_template_key,t.moderation_tier,t.depth,t.path_ids,t.path_names,
         exists(select 1 from public.marketplace_taxonomy_categories child where child.parent_id=t.id)
  from tree t
  order by t.path_names,t.sort_order,t.name;
end;
$$;

revoke all on function public.admin_get_marketplace_taxonomy_tree_v2(text) from public,anon;
grant execute on function public.admin_get_marketplace_taxonomy_tree_v2(text) to authenticated,service_role;

create temporary table tmp_research_paths(listing_type_code text not null,path_names text[] not null) on commit drop;
insert into tmp_research_paths values
('PHYSICAL', ARRAY['Power & Energy']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[]),
('SERVICE', ARRAY['Construction & Trades']::text[]),
('SERVICE', ARRAY['Security Services']::text[]),
('SERVICE', ARRAY['Agriculture & Outdoor']::text[]),
('JOB', ARRAY['Management']::text[]),
('JOB', ARRAY['Architecture & Engineering']::text[]),
('JOB', ARRAY['Science']::text[]),
('JOB', ARRAY['Healthcare Support']::text[]),
('JOB', ARRAY['Community & Social Service']::text[]),
('JOB', ARRAY['Government & Public Sector']::text[]),
('JOB', ARRAY['Installation & Repair']::text[]),
('JOB', ARRAY['Personal Care']::text[]),
('JOB', ARRAY['Real Estate']::text[]),
('JOB', ARRAY['Energy & Utilities']::text[]),
('JOB', ARRAY['Telecommunications']::text[]),
('JOB', ARRAY['NGO & Nonprofit']::text[]),
('COURSE', ARRAY['Computer Science']::text[]),
('COURSE', ARRAY['Software Development']::text[]),
('COURSE', ARRAY['Data Science']::text[]),
('COURSE', ARRAY['Artificial Intelligence']::text[]),
('COURSE', ARRAY['Information Technology']::text[]),
('COURSE', ARRAY['Cybersecurity']::text[]),
('COURSE', ARRAY['Sales']::text[]),
('COURSE', ARRAY['Communication']::text[]),
('COURSE', ARRAY['Arts & Humanities']::text[]),
('COURSE', ARRAY['Math & Logic']::text[]),
('COURSE', ARRAY['Physical Science']::text[]),
('COURSE', ARRAY['Engineering']::text[]),
('COURSE', ARRAY['Agriculture']::text[]),
('COURSE', ARRAY['Creative Arts']::text[]),
('COURSE', ARRAY['Beauty & Fashion']::text[]),
('COURSE', ARRAY['Food & Cooking']::text[]),
('COURSE', ARRAY['Legal & Compliance']::text[]),
('COURSE', ARRAY['Exam Preparation']::text[]),
('COURSE', ARRAY['Kids & Youth']::text[]),
('DIGITAL', ARRAY['Website Assets']::text[]),
('DIGITAL', ARRAY['Fonts & Typography']::text[]),
('DIGITAL', ARRAY['Stock Media']::text[]),
('DIGITAL', ARRAY['Audio & Music']::text[]),
('DIGITAL', ARRAY['3D Assets']::text[]),
('DIGITAL', ARRAY['Game Assets']::text[]),
('DIGITAL', ARRAY['Ebooks & Publications']::text[]),
('DIGITAL', ARRAY['Learning Downloads']::text[]),
('DIGITAL', ARRAY['Business Templates']::text[]),
('DIGITAL', ARRAY['Craft Files']::text[]),
('DIGITAL', ARRAY['Photo & Video Presets']::text[]),
('DIGITAL', ARRAY['CAD & BIM']::text[]),
('DIGITAL', ARRAY['Data & Research']::text[]),
('DIGITAL', ARRAY['Productivity Templates']::text[]),
('TASK', ARRAY['Home Tasks']::text[]),
('TASK', ARRAY['Cleaning Tasks']::text[]),
('TASK', ARRAY['Moving Tasks']::text[]),
('TASK', ARRAY['Delivery & Errands']::text[]),
('TASK', ARRAY['Yard & Outdoor']::text[]),
('TASK', ARRAY['Personal Assistance']::text[]),
('TASK', ARRAY['Virtual Tasks']::text[]),
('TASK', ARRAY['Office Tasks']::text[]),
('TASK', ARRAY['Event Tasks']::text[]),
('TASK', ARRAY['Pet Tasks']::text[]),
('TASK', ARRAY['Automotive Tasks']::text[]),
('TASK', ARRAY['Field Tasks']::text[]),
('TASK', ARRAY['Seasonal Tasks']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts','Men''s T-Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts','Women''s T-Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts','Unisex T-Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Polo Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Dress Shirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Sweatshirts','Hoodies']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Bottoms','Jeans']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Bottoms','Trousers']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Bottoms','Shorts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Dresses']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Skirts']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Outerwear','Blazers']::text[]),
('PHYSICAL', ARRAY['Fashion','Clothing','Outerwear','Jackets']::text[]),
('PHYSICAL', ARRAY['Fashion','Underwear & Sleepwear','Underwear']::text[]),
('PHYSICAL', ARRAY['Fashion','Underwear & Sleepwear','Bras']::text[]),
('PHYSICAL', ARRAY['Fashion','Shoes','Sneakers']::text[]),
('PHYSICAL', ARRAY['Fashion','Shoes','Formal Shoes']::text[]),
('PHYSICAL', ARRAY['Fashion','Shoes','Sandals']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration','Refrigerators']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration','Freezers','Chest Freezers']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration','Freezers','Chest Freezers','Food Storage','Chest Freezers','Large-Capacity Chest Freezers']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration','Freezers','Upright Freezers']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Washing Machines']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Clothes Dryers']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Air Conditioners']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Electric Fans']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Cookers']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Microwave Ovens']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Blenders']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Electric Kettles']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Vacuum Cleaners']::text[]),
('PHYSICAL', ARRAY['Home Appliances','Electric Irons']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Vitamins']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Mineral Supplements']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Protein Supplements']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Pre-Workout Supplements']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Herbal Supplements']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Sports Nutrition']::text[]),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition','Other Dietary Supplements']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Safer Sex','Condoms']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Lubricants & Gels','Personal Lubricants']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Vibrators']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Vibrators','External & Internal','Adult Toys','Vibrators','Rechargeable Vibrators']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Dildos']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Male Masturbators']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Couples Toys']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sex Toys','Anal Toys']::text[]),
('PHYSICAL', ARRAY['Adult & Intimate Wellness','Sexual Wellness Supplements','Libido / Sexual Wellness Support']::text[]),
('PHYSICAL', ARRAY['Automotive','SUVs']::text[]),
('PHYSICAL', ARRAY['Automotive','Vans']::text[]),
('PHYSICAL', ARRAY['Automotive','Vehicle Batteries']::text[]),
('PHYSICAL', ARRAY['Power & Energy','Generators']::text[]),
('PHYSICAL', ARRAY['Power & Energy','Solar Inverters']::text[]),
('PHYSICAL', ARRAY['Power & Energy','Solar Panels']::text[]),
('PHYSICAL', ARRAY['Industrial & Scientific','Power Drills']::text[]),
('PHYSICAL', ARRAY['Industrial & Scientific','Safety PPE']::text[]),
('PHYSICAL', ARRAY['Industrial & Scientific','Water Pumps']::text[]),
('SERVICE', ARRAY['AI Services','AI Development','AI Applications','Conversational AI','Customer Interaction','AI Chatbot Development','Enterprise AI Chatbot Development']::text[]),
('SERVICE', ARRAY['Home Services','Cleaning','Home Cleaning','Routine Cleaning','Residential','House Cleaning','Recurring House Cleaning']::text[]),
('SERVICE', ARRAY['Construction & Trades','Electrical']::text[]),
('SERVICE', ARRAY['Construction & Trades','Plumbing']::text[]),
('SERVICE', ARRAY['Construction & Trades','Carpentry']::text[]),
('SERVICE', ARRAY['Construction & Trades','Welding']::text[]),
('SERVICE', ARRAY['Security Services','Security Guard Services']::text[]),
('SERVICE', ARRAY['Security Services','CCTV & Surveillance Installation']::text[]),
('SERVICE', ARRAY['Security Services','Access Control Services']::text[]),
('SERVICE', ARRAY['Agriculture & Outdoor','Farm Services']::text[]),
('SERVICE', ARRAY['Agriculture & Outdoor','Landscaping']::text[]),
('SERVICE', ARRAY['Agriculture & Outdoor','Irrigation Services']::text[]),
('JOB', ARRAY['Technology & Engineering','Software Engineering','Application Development','Frontend','Engineering','Frontend Developer','Senior Frontend Developer']::text[]),
('JOB', ARRAY['Healthcare','Nursing','Registered Nursing','General Nursing','Clinical','Registered Nurse','Contract Registered Nurse']::text[]),
('JOB', ARRAY['Management','General Management']::text[]),
('JOB', ARRAY['Architecture & Engineering','Architecture']::text[]),
('JOB', ARRAY['Architecture & Engineering','Civil Engineering']::text[]),
('JOB', ARRAY['Science','Laboratory Science']::text[]),
('JOB', ARRAY['Healthcare Support','Caregiving']::text[]),
('JOB', ARRAY['Community & Social Service','Social Work']::text[]),
('JOB', ARRAY['Government & Public Sector','Public Administration']::text[]),
('JOB', ARRAY['Installation & Repair','Electrical Installation']::text[]),
('JOB', ARRAY['Personal Care','Beauty & Wellness']::text[]),
('JOB', ARRAY['Real Estate','Property Management']::text[]),
('JOB', ARRAY['Energy & Utilities','Renewable Energy']::text[]),
('JOB', ARRAY['Telecommunications','Network Operations']::text[]),
('JOB', ARRAY['NGO & Nonprofit','Program Management']::text[]),
('COURSE', ARRAY['Artificial Intelligence','Generative AI','Large Language Models','LLM Applications','AI','Generative AI','Advanced Generative AI']::text[]),
('COURSE', ARRAY['Computer Science','Programming Fundamentals']::text[]),
('COURSE', ARRAY['Software Development','Web Development']::text[]),
('COURSE', ARRAY['Data Science','Data Analytics']::text[]),
('COURSE', ARRAY['Information Technology','IT Support']::text[]),
('COURSE', ARRAY['Cybersecurity','Ethical Hacking']::text[]),
('COURSE', ARRAY['Sales','Sales Fundamentals']::text[]),
('COURSE', ARRAY['Communication','Public Speaking']::text[]),
('COURSE', ARRAY['Arts & Humanities','History']::text[]),
('COURSE', ARRAY['Math & Logic','Mathematics']::text[]),
('COURSE', ARRAY['Physical Science','Physics']::text[]),
('COURSE', ARRAY['Engineering','Electrical Engineering']::text[]),
('COURSE', ARRAY['Agriculture','Agribusiness']::text[]),
('COURSE', ARRAY['Creative Arts','Drawing & Painting']::text[]),
('COURSE', ARRAY['Beauty & Fashion','Fashion Design']::text[]),
('COURSE', ARRAY['Food & Cooking','Cooking']::text[]),
('COURSE', ARRAY['Legal & Compliance','Compliance']::text[]),
('COURSE', ARRAY['Exam Preparation','Professional Exams']::text[]),
('COURSE', ARRAY['Kids & Youth','Kids Coding']::text[]),
('DIGITAL', ARRAY['Design','Templates','Canva Templates','Business & Marketing','Design','Canva Templates','Commercial-Use Canva Templates']::text[]),
('DIGITAL', ARRAY['Website Assets','Website Templates']::text[]),
('DIGITAL', ARRAY['Website Assets','Themes']::text[]),
('DIGITAL', ARRAY['Fonts & Typography','Fonts']::text[]),
('DIGITAL', ARRAY['Stock Media','Stock Photos']::text[]),
('DIGITAL', ARRAY['Stock Media','Stock Video']::text[]),
('DIGITAL', ARRAY['Audio & Music','Music Tracks']::text[]),
('DIGITAL', ARRAY['Audio & Music','Sound Effects']::text[]),
('DIGITAL', ARRAY['3D Assets','3D Models']::text[]),
('DIGITAL', ARRAY['Game Assets','Game Art']::text[]),
('DIGITAL', ARRAY['Game Assets','Game Code']::text[]),
('DIGITAL', ARRAY['Ebooks & Publications','Ebooks']::text[]),
('DIGITAL', ARRAY['Learning Downloads','Study Notes']::text[]),
('DIGITAL', ARRAY['Business Templates','Business Plans']::text[]),
('DIGITAL', ARRAY['Craft Files','SVG & Cutting Files']::text[]),
('DIGITAL', ARRAY['Photo & Video Presets','Lightroom Presets']::text[]),
('DIGITAL', ARRAY['CAD & BIM','CAD Files']::text[]),
('DIGITAL', ARRAY['Data & Research','Datasets']::text[]),
('DIGITAL', ARRAY['Productivity Templates','Notion Templates']::text[]),
('TASK', ARRAY['Delivery & Errands','Shopping','Groceries','Purchase & Deliver','Errands','Grocery Shopping Task','Same-Day Grocery Shopping Task']::text[]),
('TASK', ARRAY['Home Tasks','Furniture Assembly']::text[]),
('TASK', ARRAY['Cleaning Tasks','House Cleaning']::text[]),
('TASK', ARRAY['Moving Tasks','Loading & Unloading']::text[]),
('TASK', ARRAY['Yard & Outdoor','Lawn Care']::text[]),
('TASK', ARRAY['Personal Assistance','Waiting in Line']::text[]),
('TASK', ARRAY['Virtual Tasks','Online Research']::text[]),
('TASK', ARRAY['Office Tasks','Data Entry']::text[]),
('TASK', ARRAY['Event Tasks','Event Setup']::text[]),
('TASK', ARRAY['Pet Tasks','Dog Walking']::text[]),
('TASK', ARRAY['Automotive Tasks','Car Wash']::text[]),
('TASK', ARRAY['Field Tasks','Site Inspection']::text[]),
('TASK', ARRAY['Seasonal Tasks','Holiday Setup']::text[]);

do $$
declare r record; v_parent uuid; v_id uuid; v_name text; v_slug text; v_depth integer; v_last integer;
begin
  for r in select * from tmp_research_paths order by listing_type_code,cardinality(path_names),path_names loop
    v_parent:=null; v_last:=cardinality(r.path_names);
    for v_depth in 1..v_last loop
      v_name:=trim(r.path_names[v_depth]);
      v_slug:=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
      select c.id into v_id from public.marketplace_taxonomy_categories c
       where c.listing_type_code=r.listing_type_code
         and ((v_parent is null and c.parent_id is null) or c.parent_id=v_parent)
         and lower(c.slug)=lower(v_slug)
       order by c.created_at limit 1;
      if v_id is null then
        insert into public.marketplace_taxonomy_categories(
          listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
        ) values (
          r.listing_type_code,v_parent,v_name,v_slug,100,
          v_depth=v_last,true,'{"seed_kind":"research_taxonomy_alignment"}'::jsonb
        ) returning id into v_id;
      else
        update public.marketplace_taxonomy_categories set is_active=true,updated_at=now() where id=v_id;
      end if;
      if v_parent is not null and v_depth<=6 then
        update public.marketplace_taxonomy_categories
        set is_leaf=false,updated_at=now()
        where id=v_parent and is_leaf=true;
      end if;
      v_parent:=v_id;
    end loop;
  end loop;
end $$;


update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Apparel & Accessories']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='fashion' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Luggage & Bags']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='travel-luggage' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Jewellery & Watches']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='jewelry-watches' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Computers & IT']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='computers' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Cameras & Optics']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='cameras' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Vehicles & Parts']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='automotive' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Business & Industrial']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='industrial-scientific' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Agriculture']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='agriculture-farming' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Baby & Toddler']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='baby-kids' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Office Supplies']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='office-school' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Sporting Goods']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='PHYSICAL' and slug='sports-fitness' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['AI & Automation']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='ai-services' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Software & IT']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='development' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Video & Audio']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='video-animation' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Video & Audio']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='music-audio' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Marketing & Advertising']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='marketing' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Writing & Translation']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='writing' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Business & Consulting']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='consulting' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Business & Consulting']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='business' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Personal & Lifestyle']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='SERVICE' and slug='lifestyle-personal' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Computer & IT']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='technology-engineering' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Business & Finance']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='finance-accounting' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Arts & Media']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='media-entertainment' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Marketing']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='advertising-marketing' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Sales']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='sales-business-development' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Customer Service']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='customer-support' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Office & Admin']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='operations-administration' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Production & Manufacturing']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='manufacturing' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Transportation & Logistics']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='logistics-supply-chain' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Protective Services']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='JOB' and slug='security-public-safety' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Design']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='COURSE' and slug='design-creative' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Language Learning']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='COURSE' and slug='languages' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Health']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='COURSE' and slug='health-fitness' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Skilled Trades']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='COURSE' and slug='trades-vocational' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Software & Apps']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='DIGITAL' and slug='software-digital' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Developer Products']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='DIGITAL' and slug='development' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['AI Products']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='DIGITAL' and slug='ai-assets' and is_active=true;

update public.marketplace_taxonomy_categories
set synonyms = (
  select array_agg(distinct v order by v)
  from unnest(coalesce(synonyms,'{}'::text[]) || ARRAY['Design Assets']::text[]) v
  where nullif(trim(v),'') is not null
),
updated_at=now()
where listing_type_code='DIGITAL' and slug='design' and is_active=true;

create temporary view tmp_research_tree as
with recursive tree as (
  select c.id,c.listing_type_code,c.parent_id,c.name,0::integer depth,array[c.name]::text[] path_names
  from public.marketplace_taxonomy_categories c
  where c.parent_id is null
  union all
  select child.id,child.listing_type_code,child.parent_id,child.name,parent.depth+1,parent.path_names||child.name
  from public.marketplace_taxonomy_categories child
  join tree parent on parent.id=child.parent_id
)
select * from tree;

-- Form templates + moderation metadata.
update public.marketplace_taxonomy_categories c set form_template_key='PHYS-TSHIRT',moderation_tier='standard',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names=ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[];

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-PHONE',moderation_tier='standard_authenticity',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names=ARRAY['Electronics','Phones & Tablets','Smartphones']::text[];

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-LAPTOP',moderation_tier='standard_authenticity',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names=ARRAY['Electronics','Computers','Laptops']::text[];

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-TV',moderation_tier='standard_authenticity',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names=ARRAY['Electronics','TV & Audio','Televisions']::text[];

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-REFRIGERATION',moderation_tier='standard',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and (t.path_names[1:2]=ARRAY['Home Appliances','Refrigeration']::text[]);

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-VEHICLE',moderation_tier='vehicle_verification',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names[1]='Automotive';

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-SUPPLEMENT',moderation_tier='restricted_health_review',updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names[1:2]=ARRAY['Health & Beauty','Supplements & Nutrition']::text[];

update public.marketplace_taxonomy_categories c set form_template_key='PHYS-ADULT-WELLNESS',
moderation_tier=case when 'Sexual Wellness Supplements'=any(t.path_names) then 'adult_regulated_review' else 'adult_age_gate' end,
updated_at=now()
from tmp_research_tree t where c.id=t.id and t.listing_type_code='PHYSICAL'
and t.path_names[1]='Adult & Intimate Wellness';

create temporary table tmp_research_attribute_specs(
  listing_type_code text,category_path text[],attribute_key text,label text,input_type text,
  options jsonb,validation jsonb,sort_order integer,is_filterable boolean,is_searchable boolean,
  is_sortable boolean,is_comparable boolean,show_on_card boolean
) on commit drop;
insert into tmp_research_attribute_specs values
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'brand', 'Brand', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'target_age', 'Target Age', 'select', '["Baby","Kids","Teen","Adult"]'::jsonb, '{}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'audience', 'Gender / Audience', 'select', '["Men","Women","Unisex","Boys","Girls"]'::jsonb, '{}'::jsonb, 30, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'size_system', 'Size System', 'select', '["International","UK","US","EU","Numeric","Kids Age"]'::jsonb, '{}'::jsonb, 40, true, false, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'available_sizes', 'Available Sizes', 'multi_select', '["XXS","XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL"]'::jsonb, '{}'::jsonb, 50, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'color', 'Colour', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 60, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'pattern', 'Pattern', 'select', '["Solid","Graphic","Striped","Checked","Printed","Other"]'::jsonb, '{}'::jsonb, 70, true, true, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'material', 'Material', 'multi_select', '["Cotton","Polyester","Linen","Viscose","Elastane","Blend","Other"]'::jsonb, '{}'::jsonb, 80, true, true, false, true, true),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'composition', 'Material Composition', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 90, false, true, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'neckline', 'Neckline', 'select', '["Crew","V-Neck","Scoop","Collar / Polo","Other"]'::jsonb, '{}'::jsonb, 100, true, false, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'sleeve', 'Sleeve', 'select', '["Sleeveless","Short","Three-Quarter","Long"]'::jsonb, '{}'::jsonb, 110, true, false, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'fit', 'Fit', 'select', '["Slim","Regular","Relaxed","Oversized"]'::jsonb, '{}'::jsonb, 120, true, false, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'length', 'Length', 'select', '["Cropped","Regular","Longline"]'::jsonb, '{}'::jsonb, 130, true, false, false, true, false),
('PHYSICAL', ARRAY['Fashion','Clothing','Tops','Casual Tops','Knit Tops','T-Shirts']::text[], 'care', 'Care Instructions', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 140, false, false, false, false, false),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'brand', 'Brand', 'select', '["Apple","Samsung","Google","Xiaomi","Redmi","POCO","Tecno","Infinix","itel","Nokia / HMD","Oppo","Vivo","OnePlus","Huawei","Honor","Motorola","Sony","Asus","Realme","Nothing","ZTE","TCL","Alcatel","Advan","Other"]'::jsonb, '{}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'product_family', 'Product Family', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 15, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'exact_model', 'Exact Model', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'model_number', 'Model Number', 'text', '[]'::jsonb, '{"maxLength":100}'::jsonb, 25, true, true, false, true, false),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'display_type', 'Display Technology', 'select', '["LCD","IPS LCD","OLED","AMOLED","LTPO OLED","Other"]'::jsonb, '{}'::jsonb, 195, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'lock_state', 'Lock State', 'select', '["Unlocked","Carrier Locked","Unknown"]'::jsonb, '{}'::jsonb, 265, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'included_accessories', 'Included Accessories', 'multi_select', '["Box","Cable","Charger","Case","Earphones","None","Other"]'::jsonb, '{}'::jsonb, 270, true, false, false, false, false),
('PHYSICAL', ARRAY['Electronics','Phones & Tablets','Smartphones']::text[], 'warranty_months', 'Warranty (Months)', 'number', '[]'::jsonb, '{"min":0,"max":120}'::jsonb, 275, true, false, true, false, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'brand', 'Brand', 'select', '["Apple","HP","Dell","Lenovo","Asus","Acer","Microsoft","MSI","Samsung","Huawei","LG","Razer","Gigabyte","Framework","Dynabook","Fujitsu","Chuwi","Medion","Other"]'::jsonb, '{}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'series_family', 'Series / Family', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'exact_model', 'Exact Model', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 30, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'model_number', 'Model Number', 'text', '[]'::jsonb, '{"maxLength":100}'::jsonb, 40, true, true, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'cpu_brand', 'CPU Brand', 'select', '["Apple","Intel","AMD","Qualcomm","Other"]'::jsonb, '{}'::jsonb, 50, true, true, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'cpu_model', 'CPU Model', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 60, true, true, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'storage_type', 'Storage Type', 'select', '["SSD","HDD","SSD + HDD","eMMC","Other"]'::jsonb, '{}'::jsonb, 70, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'resolution', 'Resolution', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 160, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'touchscreen', 'Touchscreen', 'toggle', '[]'::jsonb, '{}'::jsonb, 170, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'operating_system', 'Operating System', 'select', '["Windows","macOS","Linux","ChromeOS","No OS","Other"]'::jsonb, '{}'::jsonb, 180, true, true, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'keyboard_layout', 'Keyboard Layout', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 190, true, false, false, false, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'ports', 'Ports', 'tags', '[]'::jsonb, '{}'::jsonb, 200, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'battery_condition', 'Battery Condition', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 210, false, false, false, false, false),
('PHYSICAL', ARRAY['Electronics','Computers','Laptops']::text[], 'warranty_months', 'Warranty (Months)', 'number', '[]'::jsonb, '{"min":0,"max":120}'::jsonb, 220, true, false, true, false, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'brand', 'Brand', 'select', '["LG","Samsung","Hisense","TCL","Sony","Panasonic","Sharp","Philips","Xiaomi","Skyworth","Toshiba","JVC","Haier","Nexus","Bruhm","Polystar","Scanfrost","Other"]'::jsonb, '{}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'model', 'Model', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'screen_size_inches', 'Screen Size (inches)', 'number', '[]'::jsonb, '{"min":10,"max":200}'::jsonb, 30, true, true, true, true, true),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'panel_technology', 'Panel Technology', 'select', '["LED","QLED","OLED","Mini-LED","LCD","Other"]'::jsonb, '{}'::jsonb, 40, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'resolution', 'Resolution', 'select', '["HD","Full HD","4K UHD","8K","Other"]'::jsonb, '{}'::jsonb, 50, true, true, false, true, true),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'smart_tv', 'Smart TV', 'toggle', '[]'::jsonb, '{}'::jsonb, 60, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'smart_os', 'Smart TV OS', 'text', '[]'::jsonb, '{"maxLength":100}'::jsonb, 70, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'refresh_rate_hz', 'Refresh Rate (Hz)', 'number', '[]'::jsonb, '{"min":24,"max":1000}'::jsonb, 80, true, false, true, true, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'hdmi_ports', 'HDMI Port Count', 'number', '[]'::jsonb, '{"min":0,"max":20}'::jsonb, 90, true, false, true, false, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'hdr_formats', 'HDR Formats', 'tags', '[]'::jsonb, '{}'::jsonb, 100, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'wireless_connectivity', 'Wi-Fi / Bluetooth', 'multi_select', '["Wi-Fi","Bluetooth","Wi-Fi + Bluetooth","None"]'::jsonb, '{}'::jsonb, 110, true, false, false, true, false),
('PHYSICAL', ARRAY['Electronics','TV & Audio','Televisions']::text[], 'warranty_months', 'Warranty (Months)', 'number', '[]'::jsonb, '{"min":0,"max":120}'::jsonb, 120, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'brand', 'Brand', 'select', '["LG","Samsung","Hisense","Haier Thermocool","Scanfrost","Nexus","Midea","Polystar","Bruhm","Binatone","Panasonic","Bosch","Beko","Whirlpool","Electrolux","Frigidaire","Kenwood","Century","Maxi","Other"]'::jsonb, '{}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'model', 'Model', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'appliance_type', 'Appliance Type', 'select', '["Refrigerator","Chest Freezer","Upright Freezer","Fridge-Freezer","Other"]'::jsonb, '{}'::jsonb, 30, true, true, false, true, true),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'capacity_litres', 'Capacity (Litres)', 'number', '[]'::jsonb, '{"min":1,"max":5000}'::jsonb, 40, true, true, true, true, true),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'energy_efficiency', 'Energy Efficiency', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 50, true, false, false, true, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'inverter_compressor', 'Inverter Compressor', 'toggle', '[]'::jsonb, '{}'::jsonb, 60, true, false, false, true, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'rated_power_w', 'Rated Power (W)', 'number', '[]'::jsonb, '{"min":0,"max":100000}'::jsonb, 70, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'voltage_v', 'Voltage (V)', 'number', '[]'::jsonb, '{"min":0,"max":1000}'::jsonb, 80, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'width_cm', 'Width (cm)', 'number', '[]'::jsonb, '{"min":0,"max":1000}'::jsonb, 90, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'height_cm', 'Height (cm)', 'number', '[]'::jsonb, '{"min":0,"max":1000}'::jsonb, 100, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'depth_cm', 'Depth (cm)', 'number', '[]'::jsonb, '{"min":0,"max":1000}'::jsonb, 110, true, false, true, false, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'color', 'Colour', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 120, true, true, false, true, false),
('PHYSICAL', ARRAY['Home Appliances','Refrigeration']::text[], 'warranty_months', 'Warranty (Months)', 'number', '[]'::jsonb, '{"min":0,"max":120}'::jsonb, 130, true, false, true, false, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'make', 'Make', 'select', '["Toyota","Honda","Mercedes-Benz","BMW","Lexus","Hyundai","Kia","Nissan","Volkswagen","Ford","Audi","Land Rover","Range Rover","Peugeot","Renault","Mazda","Mitsubishi","Suzuki","Chevrolet","Jeep","Volvo","Porsche","Tesla","BYD","Geely","Changan","GAC","JAC","MG","Chery","Cadillac","GMC","Isuzu","Subaru","Infiniti","Acura","Mini","Fiat","Skoda","Seat","Citroën","Opel","Dodge","Chrysler","RAM","Ferrari","Lamborghini","Bentley","Rolls-Royce","Maserati","Aston Martin","McLaren","Lincoln","Genesis","Rivian","Lucid","Great Wall","Haval","Dongfeng","BAIC","Other"]'::jsonb, '{}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'model', 'Model', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'year', 'Year', 'number', '[]'::jsonb, '{"min":1886,"max":2100}'::jsonb, 30, true, true, true, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'trim_grade', 'Trim / Grade', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 40, true, true, false, true, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'body_type', 'Body Type', 'select', '["Sedan","SUV","Hatchback","Coupe","Convertible","Wagon","Van","Pickup","Motorcycle","Other"]'::jsonb, '{}'::jsonb, 50, true, true, false, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'mileage_km', 'Mileage (km)', 'number', '[]'::jsonb, '{"min":0,"max":5000000}'::jsonb, 60, true, true, true, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'transmission', 'Transmission', 'select', '["Automatic","Manual","CVT","DCT","Other"]'::jsonb, '{}'::jsonb, 70, true, true, false, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'powertrain', 'Fuel / Powertrain', 'select', '["Petrol","Diesel","Hybrid","Plug-in Hybrid","Electric","CNG","LPG","Other"]'::jsonb, '{}'::jsonb, 80, true, true, false, true, true),
('PHYSICAL', ARRAY['Automotive']::text[], 'engine_motor', 'Engine / Motor', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 90, true, true, false, true, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'drivetrain', 'Drivetrain', 'select', '["FWD","RWD","AWD","4WD","Other"]'::jsonb, '{}'::jsonb, 100, true, true, false, true, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'exterior_color', 'Exterior Colour', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 110, true, true, false, true, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'interior_color', 'Interior Colour', 'text', '[]'::jsonb, '{"maxLength":80}'::jsonb, 120, true, false, false, true, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'accident_disclosure', 'Accident / Rebuild Disclosure', 'textarea', '[]'::jsonb, '{"maxLength":1000}'::jsonb, 130, false, true, false, false, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'registration_status', 'Registration Status', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 140, true, false, false, false, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'inspection_status', 'Inspection Status', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 150, true, false, false, false, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'finance_available', 'Finance Available', 'toggle', '[]'::jsonb, '{}'::jsonb, 160, true, false, false, false, false),
('PHYSICAL', ARRAY['Automotive']::text[], 'seller_dealer_type', 'Seller / Dealer Type', 'select', '["Private Seller","Dealer","Fleet","Other"]'::jsonb, '{}'::jsonb, 170, true, false, false, true, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'brand', 'Brand', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'product_name', 'Product Name', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'supplement_type', 'Supplement Type', 'select', '["Vitamin","Mineral","Protein","Herbal","Sports Nutrition","Pre-Workout","Other"]'::jsonb, '{}'::jsonb, 30, true, true, false, true, true),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'form', 'Form', 'select', '["Tablet","Capsule","Powder","Liquid","Gummy","Sachet","Other"]'::jsonb, '{}'::jsonb, 40, true, true, false, true, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'active_ingredients', 'Active Ingredients', 'textarea', '[]'::jsonb, '{"maxLength":3000}'::jsonb, 50, true, true, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'full_ingredients', 'Full Ingredients', 'textarea', '[]'::jsonb, '{"maxLength":5000}'::jsonb, 60, false, true, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'serving_size', 'Serving Size', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 70, true, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'servings_per_container', 'Servings per Container', 'number', '[]'::jsonb, '{"min":0,"max":10000}'::jsonb, 80, true, false, true, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'net_quantity', 'Net Quantity', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 90, true, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'dietary_properties', 'Dietary Properties', 'tags', '[]'::jsonb, '{}'::jsonb, 100, true, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'allergens', 'Allergens', 'tags', '[]'::jsonb, '{}'::jsonb, 110, true, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'expiry_date', 'Expiry Date', 'date', '[]'::jsonb, '{}'::jsonb, 120, true, false, true, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'country_of_origin', 'Country of Origin', 'text', '[]'::jsonb, '{"maxLength":100}'::jsonb, 130, true, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'regulatory_reference', 'Regulatory Reference', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 140, false, false, false, false, false),
('PHYSICAL', ARRAY['Health & Beauty','Supplements & Nutrition']::text[], 'warnings', 'Warnings', 'textarea', '[]'::jsonb, '{"maxLength":3000}'::jsonb, 150, false, true, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'product_type', 'Product Type', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 10, true, true, false, true, true),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'brand', 'Brand', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 20, true, true, false, true, true),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'material', 'Material', 'text', '[]'::jsonb, '{"maxLength":120}'::jsonb, 30, true, false, false, true, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'dimensions', 'Dimensions', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 40, false, false, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'power_charging', 'Power / Charging Method', 'text', '[]'::jsonb, '{"maxLength":160}'::jsonb, 50, true, false, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'water_resistance', 'Water Resistance', 'text', '[]'::jsonb, '{"maxLength":100}'::jsonb, 60, true, false, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'reuse_type', 'Use Type', 'select', '["Single-use","Reusable","Not Applicable"]'::jsonb, '{}'::jsonb, 70, true, false, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'cleaning_care', 'Cleaning & Care', 'textarea', '[]'::jsonb, '{"maxLength":2000}'::jsonb, 80, false, true, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'ingredients', 'Ingredients (if applicable)', 'textarea', '[]'::jsonb, '{"maxLength":3000}'::jsonb, 90, false, true, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'expiry_date', 'Expiry Date (if applicable)', 'date', '[]'::jsonb, '{}'::jsonb, 100, true, false, true, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'regulatory_reference', 'Regulatory Reference (if applicable)', 'text', '[]'::jsonb, '{"maxLength":180}'::jsonb, 110, false, false, false, false, false),
('PHYSICAL', ARRAY['Adult & Intimate Wellness']::text[], 'warnings', 'Warnings', 'textarea', '[]'::jsonb, '{"maxLength":3000}'::jsonb, 120, false, true, false, false, false);

insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,is_required,
  is_searchable,is_filterable,is_sortable,is_comparable,show_on_card,show_on_details,
  options,validation,sort_order,schema_version,is_active
)
select s.listing_type_code,t.id,s.attribute_key,s.label,s.input_type,false,
       s.is_searchable,s.is_filterable,s.is_sortable,s.is_comparable,s.show_on_card,true,
       s.options,s.validation,s.sort_order,1,true
from tmp_research_attribute_specs s
join tmp_research_tree t on t.listing_type_code=s.listing_type_code and t.path_names=s.category_path
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code=s.listing_type_code and d.category_id=t.id
    and d.attribute_key=s.attribute_key and d.schema_version=1
);

update public.marketplace_attribute_definitions d
set label=s.label,input_type=s.input_type,options=s.options,validation=s.validation,
    sort_order=s.sort_order,is_filterable=s.is_filterable,is_searchable=s.is_searchable,
    is_sortable=s.is_sortable,is_comparable=s.is_comparable,show_on_card=s.show_on_card,
    show_on_details=true,is_active=true,updated_at=now()
from tmp_research_attribute_specs s
join tmp_research_tree t on t.listing_type_code=s.listing_type_code and t.path_names=s.category_path
where d.listing_type_code=s.listing_type_code and d.category_id=t.id
  and d.attribute_key=s.attribute_key and d.schema_version=1;

commit;