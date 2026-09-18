alter table public.users
  add column if not exists media_quality_preference text not null default 'auto' check (media_quality_preference in ('auto','data_saver','high')),
  add column if not exists preferred_video_quality text not null default 'auto' check (preferred_video_quality in ('auto','360p','480p','720p','1080p','1440p','2160p'));

-- Product images remain in the dedicated public image bucket; product video policy uses
-- the already-integrated Cloudinary provider rather than pretending the image-only bucket supports video.
update public.media_storage_policies
set provider='cloudinary', bucket=null, updated_at=now()
where feature='product_videos';

-- Social direct-file fallback remains on Supabase until an optional adaptive streaming provider is enabled.
update public.media_storage_policies
set compression_policy = compression_policy || '{"adaptive_streaming":"provider_optional","direct_fallback":true,"resumable_threshold_bytes":6291456}'::jsonb,
    updated_at=now()
where feature in ('social_videos','product_videos','campaign_media','cms_media','chat_files');