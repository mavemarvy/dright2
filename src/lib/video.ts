export type VideoPlatform = 'youtube' | 'vimeo' | 'dailymotion' | 'tiktok' | 'twitter' | 'facebook' | 'twitch' | 'loom' | 'direct' | 'unknown';

export interface ParsedVideo {
  platform: VideoPlatform;
  embedUrl: string | null;
  isPlayable: boolean;
}

/**
 * Parse any social media or direct video URL into an embeddable iframe URL.
 * Supports: YouTube, Vimeo, Dailymotion, TikTok, Twitter/X, Facebook, Twitch, Loom, and direct video files.
 */
export function parseVideoUrl(url: string): ParsedVideo {
  if (!url || !url.trim()) return { platform: 'unknown', embedUrl: null, isPlayable: false };

  const trimmed = url.trim();

  // YouTube: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    let videoId = '';
    if (trimmed.includes('youtu.be/')) {
      videoId = trimmed.split('youtu.be/')[1]?.split(/[?&]/)[0] || '';
    } else if (trimmed.includes('watch?v=')) {
      videoId = trimmed.split('watch?v=')[1]?.split(/[&]/)[0] || '';
    } else if (trimmed.includes('/embed/')) {
      videoId = trimmed.split('/embed/')[1]?.split(/[?&]/)[0] || '';
    } else if (trimmed.includes('/shorts/')) {
      videoId = trimmed.split('/shorts/')[1]?.split(/[?&]/)[0] || '';
    }
    if (videoId) {
      return {
        platform: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
        isPlayable: true,
      };
    }
  }

  // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
  if (trimmed.includes('vimeo.com')) {
    let videoId = '';
    if (trimmed.includes('player.vimeo.com/video/')) {
      videoId = trimmed.split('player.vimeo.com/video/')[1]?.split(/[?&]/)[0] || '';
    } else {
      const parts = trimmed.split('vimeo.com/')[1]?.split('/');
      videoId = parts?.[parts.length - 1]?.split(/[?&]/)[0] || '';
    }
    if (videoId) {
      return {
        platform: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${videoId}?title=0&byline=0`,
        isPlayable: true,
      };
    }
  }

  // Dailymotion: dailymotion.com/video/ID, dai.ly/ID
  if (trimmed.includes('dailymotion.com') || trimmed.includes('dai.ly')) {
    let videoId = '';
    if (trimmed.includes('dai.ly/')) {
      videoId = trimmed.split('dai.ly/')[1]?.split(/[?&]/)[0] || '';
    } else if (trimmed.includes('/video/')) {
      videoId = trimmed.split('/video/')[1]?.split(/[?&_]/)[0] || '';
    }
    if (videoId) {
      return {
        platform: 'dailymotion',
        embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`,
        isPlayable: true,
      };
    }
  }

  // TikTok: tiktok.com/@user/video/ID
  if (trimmed.includes('tiktok.com')) {
    const match = trimmed.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    const videoId = match?.[1] || '';
    if (videoId) {
      return {
        platform: 'tiktok',
        embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
        isPlayable: true,
      };
    }
  }

  // Twitter/X: twitter.com/user/status/ID, x.com/user/status/ID
  if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) {
    const match = trimmed.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/);
    const tweetId = match?.[1] || '';
    if (tweetId) {
      return {
        platform: 'twitter',
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`,
        isPlayable: true,
      };
    }
  }

  // Facebook: facebook.com/watch?v=ID, fb.watch/ID
  if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
    let videoId = '';
    if (trimmed.includes('fb.watch/')) {
      videoId = trimmed.split('fb.watch/')[1]?.split(/[?&]/)[0] || '';
    } else if (trimmed.includes('watch?v=')) {
      videoId = trimmed.split('watch?v=')[1]?.split(/[&]/)[0] || '';
    } else if (trimmed.includes('/videos/')) {
      videoId = trimmed.split('/videos/')[1]?.split(/[?&/]/)[0] || '';
    }
    if (videoId) {
      return {
        platform: 'facebook',
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=false`,
        isPlayable: true,
      };
    }
  }

  // Twitch: twitch.tv/videos/ID, twitch.tv/channel
  if (trimmed.includes('twitch.tv')) {
    if (trimmed.includes('/videos/')) {
      const videoId = trimmed.split('/videos/')[1]?.split(/[?&]/)[0] || '';
      if (videoId) {
        return {
          platform: 'twitch',
          embedUrl: `https://player.twitch.tv/?video=${videoId}&parent=${window.location.hostname}`,
          isPlayable: true,
        };
      }
    }
    const channel = trimmed.split('twitch.tv/')[1]?.split(/[?&/]/)[0] || '';
    if (channel) {
      return {
        platform: 'twitch',
        embedUrl: `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`,
        isPlayable: true,
      };
    }
  }

  // Loom: loom.com/share/ID, loom.com/embed/ID
  if (trimmed.includes('loom.com')) {
    let videoId = '';
    if (trimmed.includes('/embed/')) {
      videoId = trimmed.split('/embed/')[1]?.split(/[?&/]/)[0] || '';
    } else if (trimmed.includes('/share/')) {
      videoId = trimmed.split('/share/')[1]?.split(/[?&/]/)[0] || '';
    }
    if (videoId) {
      return {
        platform: 'loom',
        embedUrl: `https://www.loom.com/embed/${videoId}`,
        isPlayable: true,
      };
    }
  }

  // Direct video file: .mp4, .webm, .ogg, .mov
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(trimmed)) {
    return {
      platform: 'direct',
      embedUrl: trimmed,
      isPlayable: true,
    };
  }

  // Unknown — return as direct attempt
  return { platform: 'unknown', embedUrl: null, isPlayable: false };
}

export const SUPPORTED_VIDEO_PLATFORMS = [
  { name: 'YouTube', hint: 'youtube.com/watch?v=... or youtu.be/...' },
  { name: 'Vimeo', hint: 'vimeo.com/...' },
  { name: 'Dailymotion', hint: 'dailymotion.com/video/... or dai.ly/...' },
  { name: 'TikTok', hint: 'tiktok.com/@user/video/...' },
  { name: 'Twitter/X', hint: 'twitter.com/user/status/... or x.com/...' },
  { name: 'Facebook', hint: 'facebook.com/watch or fb.watch/...' },
  { name: 'Twitch', hint: 'twitch.tv/videos/... or twitch.tv/channel' },
  { name: 'Loom', hint: 'loom.com/share/...' },
  { name: 'Direct Video', hint: 'https://example.com/video.mp4' },
];
