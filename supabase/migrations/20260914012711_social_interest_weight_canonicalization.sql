do $$
declare
  v_sig regprocedure := 'public.get_social_feed_v2(text,text,integer,uuid,uuid,uuid)'::regprocedure;
  v_def text;
begin
  select pg_get_functiondef(v_sig) into v_def;
  if position('v_interest numeric:=14' in v_def)=0 then
    if position('v_category_max integer:=4; v_result jsonb;' in v_def)=0
       or position('social_creator_max_per_window,social_category_max_per_window INTO' in v_def)=0
       or position('+b.interest_hit*12+' in v_def)=0 then
      raise exception 'get_social_feed_v2 definition changed; refusing unsafe automatic rewrite';
    end if;
    v_def := replace(v_def,
      'v_category_max integer:=4; v_result jsonb;',
      'v_category_max integer:=4; v_interest numeric:=14; v_result jsonb;');
    v_def := replace(v_def,
      'social_creator_max_per_window,social_category_max_per_window INTO',
      'social_creator_max_per_window,social_category_max_per_window,social_interest_weight INTO');
    v_def := replace(v_def,
      ',v_creator_max,v_category_max FROM public.algorithm_settings',
      ',v_creator_max,v_category_max,v_interest FROM public.algorithm_settings');
    v_def := replace(v_def,
      '+b.interest_hit*12+',
      '+b.interest_hit*v_interest+');
    execute v_def;
  end if;
end $$;