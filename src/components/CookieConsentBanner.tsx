import { useEffect, useState } from 'react';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNavigationVisibility } from '../contexts/NavigationVisibilityContext';
import { supabase } from '../lib/supabase';

const CONSENT_VERSION = '2026-09';
const STORAGE_KEY = 'dright:cookie-consent:' + CONSENT_VERSION;

type Preference = 'necessary' | 'all';

export default function CookieConsentBanner() {
  const { user, isAdmin } = useAuth();
  const { isVisible, ready } = useNavigationVisibility();
  const [open, setOpen] = useState(false);
  const visible = isVisible('cookie_consent_banner', isAdmin);

  useEffect(() => {
    if (!ready || !visible) {
      setOpen(false);
      return;
    }
    try {
      setOpen(!window.localStorage.getItem(STORAGE_KEY));
    } catch {
      setOpen(true);
    }
  }, [ready, visible]);

  const save = async (preference: Preference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: CONSENT_VERSION,
        preference,
        saved_at: new Date().toISOString(),
      }));
    } catch {
      // Consent still applies to this session even if browser storage is unavailable.
    }

    setOpen(false);

    if (user?.id) {
      const analyticsAllowed = preference === 'all';
      const marketingAllowed = preference === 'all';
      const { error } = await supabase.from('cookie_consents').upsert({
        user_id: user.id,
        consent_version: CONSENT_VERSION,
        preference,
        analytics_allowed: analyticsAllowed,
        marketing_allowed: marketingAllowed,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) console.warn('Cookie preference could not be synced to the account.', error);
    }
  };

  if (!open || !visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-[76px] z-[80] mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white/98 p-4 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/98 md:bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <Cookie className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-950 dark:text-white">Your cookie choices</h2>
              <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                DRIGHT uses necessary storage for sign-in, security, device protection and preferences. You can also allow optional analytics and marketing storage.
              </p>
            </div>
            <button type="button" onClick={() => void save('necessary')} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close and use necessary cookies only">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save('all')} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">
              Accept all
            </button>
            <button type="button" onClick={() => void save('necessary')} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
              Necessary only
            </button>
            <Link to="/legal/cookie-policy" className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
              <ShieldCheck className="h-4 w-4" /> Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
