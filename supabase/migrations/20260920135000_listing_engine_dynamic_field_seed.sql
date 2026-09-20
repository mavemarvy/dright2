-- Seed non-destructive dynamic-form definitions for the DRIGHT2 listing engine.
-- All fields are initially optional and stored in marketplace_listing_extensions.
-- Existing listing columns and financial authority remain unchanged.

begin;

with seed(
  listing_type_code,attribute_key,label,input_type,is_required,
  is_searchable,is_filterable,is_sortable,is_comparable,show_on_card,show_on_details,
  options,validation,sort_order
) as (
  values
    ('PHYSICAL','condition','Condition','select',false,false,true,false,true,true,true,
      '["New","Open box","Gently Used","Refurbished"]'::jsonb,'{}'::jsonb,10),
    ('PHYSICAL','brand','Brand','text',false,true,true,false,true,true,true,
      '[]'::jsonb,'{"maxLength":120}'::jsonb,20),
    ('PHYSICAL','sku','SKU / Barcode','text',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":120}'::jsonb,30),
    ('PHYSICAL','weight_kg','Parcel Weight (kg)','number',false,false,true,true,true,false,true,
      '[]'::jsonb,'{"min":0,"max":100000}'::jsonb,40),
    ('PHYSICAL','shipping_options','Fulfillment Options','multi_select',false,false,true,false,false,false,true,
      '["Local Pickup","Flat Rate Shipping","Calculated Carrier Shipping"]'::jsonb,'{}'::jsonb,50),

    ('DIGITAL','usage_rights','Usage Rights','select',false,false,true,false,true,true,true,
      '["Personal Use Only","Commercial License","Resale Rights"]'::jsonb,'{}'::jsonb,10),
    ('DIGITAL','compatibility','Software / Device Compatibility','text',false,true,true,false,true,false,true,
      '[]'::jsonb,'{"maxLength":180}'::jsonb,20),
    ('DIGITAL','version','Version','text',false,true,true,false,true,false,true,
      '[]'::jsonb,'{"maxLength":80}'::jsonb,30),
    ('DIGITAL','license_key_delivery','License Key Required','toggle',false,false,true,false,false,false,true,
      '[]'::jsonb,'{}'::jsonb,40),

    ('SERVICE','pricing_model','Pricing Model','select',false,false,true,false,true,false,true,
      '["Fixed Package","Hourly Consultation"]'::jsonb,'{}'::jsonb,10),
    ('SERVICE','deliverables','Service Deliverables','textarea',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":2000}'::jsonb,20),
    ('SERVICE','revision_cap','Included Revisions','select',false,false,true,false,true,false,true,
      '["0","1","3","Unlimited"]'::jsonb,'{}'::jsonb,30),
    ('SERVICE','turnaround_days','Estimated Turnaround (days)','number',false,false,true,true,true,false,true,
      '[]'::jsonb,'{"min":0,"max":3650}'::jsonb,40),

    ('COURSE','access_expiration','Course Access','select',false,false,true,false,true,false,true,
      '["Lifetime Access","1-Year Access","Subscription Access"]'::jsonb,'{}'::jsonb,10),
    ('COURSE','learning_objectives','Learning Objectives','textarea',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":3000}'::jsonb,20),
    ('COURSE','prerequisites','Course Prerequisites','textarea',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":2000}'::jsonb,30),
    ('COURSE','discussion_enabled','Student Discussion Enabled','toggle',false,false,true,false,false,false,true,
      '[]'::jsonb,'{}'::jsonb,40),
    ('COURSE','quiz_enabled','Completion Quiz Enabled','toggle',false,false,true,false,false,false,true,
      '[]'::jsonb,'{}'::jsonb,50),

    ('JOB','pay_interval','Pay Interval','select',false,false,true,false,true,true,true,
      '["Hourly","Monthly","Yearly"]'::jsonb,'{}'::jsonb,10),
    ('JOB','company_website','Company Website','url',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":500}'::jsonb,20),
    ('JOB','company_registration_number','Company / Registration Number','text',false,false,false,false,false,false,false,
      '[]'::jsonb,'{"maxLength":150}'::jsonb,30),
    ('JOB','professional_email','Professional Contact Email','email',false,false,false,false,false,false,false,
      '[]'::jsonb,'{"maxLength":320}'::jsonb,40),

    ('TASK','task_mode','Task Mode','select',false,false,true,false,true,true,true,
      '["Digital Task","Location-Dependent Local Task"]'::jsonb,'{}'::jsonb,10),
    ('TASK','turnaround_hours','Target Turnaround (hours)','number',false,false,true,true,true,false,true,
      '[]'::jsonb,'{"min":1,"max":8760}'::jsonb,20),
    ('TASK','buyer_prerequisites','What I Need From the Buyer','textarea',false,true,false,false,false,false,true,
      '[]'::jsonb,'{"maxLength":2000}'::jsonb,30),
    ('TASK','location_radius_km','Service Radius (km)','number',false,false,true,true,false,false,true,
      '[]'::jsonb,'{"min":0,"max":5000}'::jsonb,40)
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,is_required,
  is_searchable,is_filterable,is_sortable,is_comparable,show_on_card,show_on_details,
  options,validation,sort_order,schema_version,is_active
)
select
  s.listing_type_code,null,s.attribute_key,s.label,s.input_type,s.is_required,
  s.is_searchable,s.is_filterable,s.is_sortable,s.is_comparable,s.show_on_card,s.show_on_details,
  s.options,s.validation,s.sort_order,1,true
from seed s
where not exists (
  select 1
  from public.marketplace_attribute_definitions d
  where d.listing_type_code=s.listing_type_code
    and d.category_id is null
    and d.attribute_key=s.attribute_key
    and d.schema_version=1
);

commit;
