import { useMemo } from 'react';
import { parseVideoUrl, type ParsedVideo } from '../lib/video';
import { Video, AlertCircle, ExternalLink } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  title?: string;
}

export default function VideoPlayer({ url, title }: VideoPlayerProps) {
  const parsed: ParsedVideo = useMemo(() => parseVideoUrl(url), [url]);

  if (!parsed.isPlayable || !parsed.embedUrl) {
    return (
      <div className="rounded-2xl overflow-hidden bg-gray-900 aspect-video flex flex-col items-center justify-center text-center p-6">
        <AlertCircle className="w-10 h-10 text-gray-500 mb-3" />
        <p className="text-gray-400 text-sm font-medium">Video not available</p>
        <p className="text-gray-500 text-xs mt-1">Unsupported video URL format</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
          <ExternalLink className="w-3 h-3" />Open original link
        </a>
      </div>
    );
  }

  // Direct video file — use <video> element
  if (parsed.platform === 'direct') {
    return (
      <div className="rounded-2xl overflow-hidden bg-black aspect-video">
        <video src={parsed.embedUrl} controls className="w-full h-full" title={title}>
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // All other platforms — use iframe
  return (
    <div className="rounded-2xl overflow-hidden bg-black aspect-video">
      <iframe
        src={parsed.embedUrl}
        className="w-full h-full"
        title={title || 'Demo video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        frameBorder="0"
      />
    </div>
  );
}

export function VideoPlatformHint() {
  return (
    <div className="text-xs text-gray-400 mt-1">
      <span className="flex items-center gap-1"><Video className="w-3 h-3" />Supported: YouTube, Vimeo, TikTok, Twitter/X, Facebook, Twitch, Loom, Dailymotion, or direct .mp4/.webm links</span>
    </div>
  );
}
