import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type CenterQuestionnaire = { status: string };
type CenterPayload = {
  account: null | {
    full_name: string | null;
    username: string | null;
    email_verified: boolean;
  };
  private_profile: null | {
    country_iso2: string | null;
    date_of_birth: string | null;
    intended_profiles: string[];
  };
  location_verified: boolean;
  kyc_required: boolean;
  kyc_status: string;
  kyc_level: string;
  questionnaires: CenterQuestionnaire[];
};

const COMPLETE_Q = new Set(['submitted', 'under_review', 'approved']);
const DISMISS_KEY = 'dright_completion_prompt_dismissed_session';

export default function AccountCompletionPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<CenterPayload | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!user) { setData(null); return; }
    let active = true;

    const load = async () => {
      const ensured = await supabase.rpc('ensure_my_onboarding_profile');
      if (ensured.error) return;

      const { data: payload, error } = await supabase.rpc('get_my_onboarding_center');
      if (active && !error) setData(payload as CenterPayload);
    };

    void load();
    return () => { active = false; };
  }, [user, location.pathname]);

  const missing = useMemo(() => {
    if (!data) return [] as string[];
    const items: string[] = [];

    if (data.account?.email_verified !== true) items.push('email verification');

    const profileDetailsComplete = Boolean(
      data.account?.full_name?.trim()
      && data.account?.username?.trim()
      && data.private_profile?.country_iso2
      && data.private_profile?.date_of_birth
      && (data.private_profile?.intended_profiles?.length ?? 0) > 0,
    );
    if (!profileDetailsComplete) items.push('signup details');

    if (!data.location_verified) items.push('location');

    if (data.kyc_required && data.kyc_status !== 'approved') {
      const level = data.kyc_level && data.kyc_level !== 'unverified'
        ? ' (' + data.kyc_level.replace(/_/g, ' ') + ')'
        : '';
      items.push('KYC' + level);
    }

    const q = (data.questionnaires ?? []).filter((item) => !COMPLETE_Q.has(item.status)).length;
    if (q > 0) items.push(String(q) + ' questionnaire' + (q === 1 ? '' : 's'));

    return items;
  }, [data]);

  if (!user || !data || missing.length === 0 || dismissed || location.pathname.startsWith('/settings')) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="mx-4 mt-3 md:mx-8 md:mt-4">
      <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start sm:items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">Finish setting up your DRIGHT account</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            Still to complete: {missing.join(', ')}. You can continue using DRIGHT; actions that require these checks remain gated.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/settings?tab=setup')}
            className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
          >
            Continue setup <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="p-2 rounded-lg text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
            aria-label="Dismiss until next session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
