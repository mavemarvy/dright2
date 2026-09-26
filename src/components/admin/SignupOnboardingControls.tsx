import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileQuestion, Loader2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export type SignupQuestionnaireMode = 'off' | 'minimal' | 'brief' | 'full';

interface SignupOnboardingSettings {
  questionnaire_mode: SignupQuestionnaireMode;
  show_interests_during_signup: boolean;
  show_documents_during_signup: boolean;
  updated_at?: string;
}

const MODE_OPTIONS: Array<{
  value: SignupQuestionnaireMode;
  label: string;
  detail: string;
  badge: string;
}> = [
  { value: 'off', label: 'Off', detail: 'No questionnaires during signup. Users finish them later in Settings.', badge: '0 questions' },
  { value: 'minimal', label: 'Minimal', detail: 'Show only 1 quick questionnaire question during signup.', badge: '1 question' },
  { value: 'brief', label: 'Brief', detail: 'Show only 2 quick questionnaire questions during signup.', badge: '2 questions' },
  { value: 'full', label: 'Full', detail: 'Show the complete profile questionnaires during signup.', badge: 'All questions' },
];

const DEFAULT_SETTINGS: SignupOnboardingSettings = {
  questionnaire_mode: 'brief',
  show_interests_during_signup: false,
  show_documents_during_signup: false,
};

export default function SignupOnboardingControls() {
  const [settings, setSettings] = useState<SignupOnboardingSettings>(DEFAULT_SETTINGS);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsResult, permissionResult] = await Promise.all([
      supabase
        .from('signup_onboarding_settings')
        .select('questionnaire_mode,show_interests_during_signup,show_documents_during_signup,updated_at')
        .eq('singleton', true)
        .maybeSingle(),
      supabase.rpc('has_dright_permission', { p_module: 'site_settings', p_action: 'manage' }),
    ]);

    if (!settingsResult.error && settingsResult.data) {
      setSettings({
        questionnaire_mode: ['off', 'minimal', 'brief', 'full'].includes(settingsResult.data.questionnaire_mode)
          ? settingsResult.data.questionnaire_mode as SignupQuestionnaireMode
          : 'brief',
        show_interests_during_signup: settingsResult.data.show_interests_during_signup === true,
        show_documents_during_signup: settingsResult.data.show_documents_during_signup === true,
        updated_at: settingsResult.data.updated_at,
      });
    }
    setCanManage(permissionResult.data === true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('signup-onboarding-settings-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signup_onboarding_settings' }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const estimatedPages = useMemo(() => {
    let total = 4; // Account, Identity, Use DRIGHT, Review
    if (settings.questionnaire_mode !== 'off') total += 1;
    if (settings.show_interests_during_signup) total += 1;
    if (settings.show_documents_during_signup) total += 1;
    return total;
  }, [settings]);

  const save = async (next: SignupOnboardingSettings) => {
    if (!canManage || saving) return;
    const previous = settings;
    setSettings(next);
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('set_signup_onboarding_settings', {
        p_questionnaire_mode: next.questionnaire_mode,
        p_show_interests_during_signup: next.show_interests_during_signup,
        p_show_documents_during_signup: next.show_documents_during_signup,
      });
      if (error) throw error;
      setMessage('Signup length updated. New signup sessions use this policy immediately.');
    } catch (error) {
      console.error('Signup onboarding settings update failed', error);
      setSettings(previous);
      setMessage(error instanceof Error ? error.message : 'Could not update signup settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex items-center justify-center min-h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-200 dark:border-primary-900/50 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 bg-primary-50/40 dark:bg-primary-950/20">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
            <FileQuestion className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Signup & Questionnaire Length</h2>
              <span className="text-[10px] font-black uppercase tracking-wide rounded-full px-2 py-1 bg-primary-600 text-white">
                ~{estimatedPages} signup pages
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Shorten signup without deleting the full questionnaires. Anything not shown during signup remains available in Settings → Account Setup.
            </p>
          </div>
          {saving && <Loader2 className="w-5 h-5 animate-spin text-primary-600 shrink-0" />}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Questionnaires during signup</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {MODE_OPTIONS.map(option => {
              const selected = settings.questionnaire_mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!canManage || saving}
                  onClick={() => void save({ ...settings, questionnaire_mode: option.value })}
                  className={`text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-50 ${selected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-800'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{option.label}</span>
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${selected
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}>
                      {option.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-5">{option.detail}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <ToggleRow
            label="Interests during signup"
            description="OFF removes the separate Interests page. Users can set interests later."
            checked={settings.show_interests_during_signup}
            disabled={!canManage || saving}
            onChange={(checked) => void save({ ...settings, show_interests_during_signup: checked })}
          />
          <ToggleRow
            label="Documents & KYC during signup"
            description="OFF moves optional professional documents and KYC uploads to Settings/Verification."
            checked={settings.show_documents_during_signup}
            disabled={!canManage || saving}
            onChange={(checked) => void save({ ...settings, show_documents_during_signup: checked })}
          />
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-5">
            Disabling or shortening signup questionnaires does not approve a user automatically. Required questionnaire/KYC/eligibility checks still gate the actions that need them.
          </p>
        </div>

        {!canManage && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Your admin account can view this policy but needs the site_settings.manage permission to change it.
          </p>
        )}
        {message && <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">{message}</p>}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
