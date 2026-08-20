export interface EnvVarSpec {
  key: string;
  label: string;
  category: 'Supabase' | 'AI' | 'Email' | 'Push' | 'Cloudflare' | 'Cloudinary' | 'Algolia';
  browserExposed: boolean;
  serverOnly: boolean;
  description: string;
}

export const ENV_REGISTRY: EnvVarSpec[] = [
  {
    key: 'SUPABASE_URL',
    label: 'Supabase URL',
    category: 'Supabase',
    browserExposed: true,
    serverOnly: false,
    description: 'Supabase project URL used by client and edge functions',
  },
  {
    key: 'SUPABASE_ANON_KEY',
    label: 'Supabase Anon Key',
    category: 'Supabase',
    browserExposed: true,
    serverOnly: false,
    description: 'Public anon key for Supabase client auth and API calls',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    label: 'Supabase Service Role Key',
    category: 'Supabase',
    browserExposed: false,
    serverOnly: true,
    description: 'Server-only key for privileged edge function operations',
  },
  {
    key: 'SUPABASE_DB_URL',
    label: 'Supabase DB URL',
    category: 'Supabase',
    browserExposed: false,
    serverOnly: true,
    description: 'Direct Postgres connection string (server-side only)',
  },
  {
    key: 'SUPABASE_PUBLISHABLE_KEYS',
    label: 'Supabase Publishable Keys',
    category: 'Supabase',
    browserExposed: false,
    serverOnly: true,
    description: 'Publishable key bundle for Supabase platform integrations',
  },
  {
    key: 'SUPABASE_SECRET_KEYS',
    label: 'Supabase Secret Keys',
    category: 'Supabase',
    browserExposed: false,
    serverOnly: true,
    description: 'Secret key bundle for Supabase platform integrations',
  },
  {
    key: 'SUPABASE_JWKS',
    label: 'Supabase JWKS',
    category: 'Supabase',
    browserExposed: false,
    serverOnly: true,
    description: 'JSON Web Key Set for JWT verification',
  },
  {
    key: 'GROQ_API_KEY',
    label: 'Groq API Key',
    category: 'AI',
    browserExposed: false,
    serverOnly: true,
    description: 'Powers the Groq AI chat, product descriptions, and moderation',
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API Key',
    category: 'AI',
    browserExposed: false,
    serverOnly: true,
    description: 'Powers Gemini AI fallback and standalone Gemini proxy',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    category: 'AI',
    browserExposed: false,
    serverOnly: true,
    description: 'Powers DALL-E image generation, Whisper transcription, and GPT-4o vision/chat',
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend API Key',
    category: 'Email',
    browserExposed: false,
    serverOnly: true,
    description: 'Powers transactional email delivery (welcome, reset, receipts, etc.)',
  },
  {
    key: 'RESEND_FROM_EMAIL',
    label: 'Resend From Email',
    category: 'Email',
    browserExposed: false,
    serverOnly: true,
    description: 'Sender email address for transactional emails',
  },
  {
    key: 'APP_URL',
    label: 'App URL',
    category: 'Email',
    browserExposed: false,
    serverOnly: true,
    description: 'Application base URL for links in transactional emails',
  },
  {
    key: 'FIREBASE_API_KEY',
    label: 'Firebase API Key',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Firebase project API key for FCM push notifications and client SDK',
  },
  {
    key: 'FIREBASE_AUTH_DOMAIN',
    label: 'Firebase Auth Domain',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Firebase auth domain for client SDK initialization',
  },
  {
    key: 'FIREBASE_PROJECT_ID',
    label: 'Firebase Project ID',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Firebase project identifier',
  },
  {
    key: 'FIREBASE_STORAGE_BUCKET',
    label: 'Firebase Storage Bucket',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Firebase storage bucket URL',
  },
  {
    key: 'FIREBASE_MESSAGING_SENDER_ID',
    label: 'Firebase Messaging Sender ID',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Sender ID for FCM push notification delivery',
  },
  {
    key: 'FIREBASE_APP_ID',
    label: 'Firebase App ID',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Firebase application identifier for client SDK',
  },
  {
    key: 'FIREBASE_MEASUREMENT_ID',
    label: 'Firebase Measurement ID',
    category: 'Push',
    browserExposed: true,
    serverOnly: false,
    description: 'Google Analytics measurement ID for Firebase',
  },
  {
    key: 'CLOUDINARY_CLOUD_NAME',
    label: 'Cloudinary Cloud Name',
    category: 'Cloudinary',
    browserExposed: true,
    serverOnly: false,
    description: 'Cloudinary cloud name for image upload and URL building',
  },
  {
    key: 'CLOUDINARY_API_KEY',
    label: 'Cloudinary API Key',
    category: 'Cloudinary',
    browserExposed: false,
    serverOnly: true,
    description: 'Cloudinary API key for signed uploads and deletions',
  },
  {
    key: 'CLOUDINARY_API_SECRET',
    label: 'Cloudinary API Secret',
    category: 'Cloudinary',
    browserExposed: false,
    serverOnly: true,
    description: 'Cloudinary API secret for signing upload requests',
  },
  {
    key: 'ALGOLIA_APP_ID',
    label: 'Algolia App ID',
    category: 'Algolia',
    browserExposed: true,
    serverOnly: false,
    description: 'Algolia application ID for search index management',
  },
  {
    key: 'ALGOLIA_SEARCH_API_KEY',
    label: 'Algolia Search API Key',
    category: 'Algolia',
    browserExposed: true,
    serverOnly: false,
    description: 'Public search-only key for client-side Algolia queries',
  },
  {
    key: 'ALGOLIA_ADMIN_API_KEY',
    label: 'Algolia Admin API Key',
    category: 'Algolia',
    browserExposed: false,
    serverOnly: true,
    description: 'Admin key for index creation, sync, and record management',
  },
  {
    key: 'TURNSTILE_SITE_KEY',
    label: 'Turnstile Site Key',
    category: 'Cloudflare',
    browserExposed: true,
    serverOnly: false,
    description: 'Public site key for Cloudflare Turnstile widget rendering on forms',
  },
  {
    key: 'TURNSTILE_SECRET',
    label: 'Turnstile Secret',
    category: 'Cloudflare',
    browserExposed: false,
    serverOnly: true,
    description: 'Server-side secret for canonical siteverify call in turnstile-verify edge function',
  },
];

export const ENV_CATEGORIES = ['Supabase', 'AI', 'Email', 'Push', 'Cloudflare', 'Cloudinary', 'Algolia'] as const;

export interface EnvVarStatus {
  key: string;
  present: boolean;
  browserExposed: boolean;
  serverOnly: boolean;
  label: string;
  category: string;
  description: string;
}

export function getBrowserEnvStatuses(): EnvVarStatus[] {
  return ENV_REGISTRY.filter((spec) => spec.browserExposed).map((spec) => {
    const viteKey = `VITE_${spec.key}`;
    const value = (import.meta.env as Record<string, string | undefined>)[viteKey];
    return {
      key: spec.key,
      present: Boolean(value),
      browserExposed: true,
      serverOnly: false,
      label: spec.label,
      category: spec.category,
      description: spec.description,
    };
  });
}
