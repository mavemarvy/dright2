ALTER TABLE public.global_announcements
  ADD COLUMN IF NOT EXISTS hide_view_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_reaction_count boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_global_content_display_settings(
  p_content_id uuid,
  p_hide_view_count boolean,
  p_hide_reaction_count boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to manage DRIGHT content settings';
  END IF;
  UPDATE public.global_announcements
  SET hide_view_count=COALESCE(p_hide_view_count,false), hide_reaction_count=COALESCE(p_hide_reaction_count,false), updated_at=now()
  WHERE id=p_content_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content not found'; END IF;
  INSERT INTO public.admin_logs(admin_id,action_type,target_id,target_type,details)
  VALUES(auth.uid(),'global_content_display_settings_updated',p_content_id,'global_content',jsonb_build_object('hide_view_count',COALESCE(p_hide_view_count,false),'hide_reaction_count',COALESCE(p_hide_reaction_count,false)));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_global_content_display_settings(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_global_content_display_settings(uuid,boolean,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_global_content_view(p_content_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user_id uuid:=auth.uid(); v_count bigint:=0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.global_announcements WHERE id=p_content_id AND is_active=true AND (content_kind='news' OR show_in_news=true)) THEN RAISE EXCEPTION 'Content not available'; END IF;
  INSERT INTO public.global_content_views(content_id,user_id) VALUES(p_content_id,v_user_id) ON CONFLICT(content_id,user_id) DO NOTHING;
  UPDATE public.global_announcements ga SET view_count=(SELECT count(*) FROM public.global_content_views v WHERE v.content_id=ga.id) WHERE ga.id=p_content_id RETURNING ga.view_count INTO v_count;
  RETURN COALESCE(v_count,0);
END;
$$;
REVOKE ALL ON FUNCTION public.record_global_content_view(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_global_content_view(uuid) TO authenticated,service_role;
