import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Camera, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2,
  Mail, MapPin, Save, ShieldCheck, Upload, UserRound, Pencil, Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadSignupQuestionnaires, uploadProfessionalDocument, PROFILE_OPTIONS } from '../lib/onboarding';
import type { QuestionnaireDefinition, QuestionnaireQuestion } from '../lib/onboarding';
import { COUNTRIES, countryFlag, findCountry } from '../lib/countries';

type AnswerMap = Record<string, Record<string, unknown>>;

type CenterQuestionnaire = {
  questionnaire_id: string;
  questionnaire_key: string;
  name: string;
  description: string | null;
  profile_type: string;
  version: number;
  submission_id: string | null;
  status: string;
  submitted_at: string | null;
  user_visible_reason: string | null;
  answers: Record<string, unknown>;
};

type CenterPayload = {
  account: null | {
    full_name: string | null;
    username: string | null;
    email: string | null;
    email_verified: boolean;
    phone: string | null;
    avatar_url: string | null;
  };
  private_profile: null | {
    country_iso2: string | null;
    country_calling_code: string | null;
    date_of_birth: string | null;
    intended_profiles: string[];
    interests: string[];
    onboarding_status: string;
    onboarding_completed_at: string | null;
  };
  location: string | null;
  location_verified: boolean;
  verification_level: string;
  kyc_required: boolean;
  kyc_status: string;
  kyc_level: string;
  kyc_expires_at: string | null;
  questionnaires: CenterQuestionnaire[];
  professional_documents_count: number;
};

const COMPLETE_STATUSES = new Set(['submitted', 'under_review', 'approved']);

export default function OnboardingCenter({ compact = false, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const [center, setCenter] = useState<CenterPayload | null>(null);
  const [definitions, setDefinitions] = useState<QuestionnaireDefinition[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [proType, setProType] = useState('cv');
  const [editingSetup, setEditingSetup] = useState(false);
  const [setupCountry, setSetupCountry] = useState('NG');
  const [setupDob, setSetupDob] = useState('');
  const [setupProfiles, setSetupProfiles] = useState<string[]>(['buyer']);
  const [setupInterests, setSetupInterests] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const ensured = await supabase.rpc('ensure_my_onboarding_profile');
      if (ensured.error) throw ensured.error;

      const { data, error } = await supabase.rpc('get_my_onboarding_center');
      if (error) throw error;
      const next = data as CenterPayload;
      setCenter(next);

      const profiles = next.private_profile?.intended_profiles?.length
        ? next.private_profile.intended_profiles
        : ['buyer'];
      const defs = await loadSignupQuestionnaires(profiles);
      setDefinitions(defs);

      const seeded: AnswerMap = {};
      for (const item of next.questionnaires ?? []) seeded[item.questionnaire_key] = item.answers ?? {};
      setAnswers(seeded);

      const country = next.private_profile?.country_iso2 || 'NG';
      setSetupCountry(country);
      setSetupDob(next.private_profile?.date_of_birth || '');
      setSetupProfiles(profiles);
      setSetupInterests((next.private_profile?.interests ?? []).join(', '));
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Could not load account completion status.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const questionnaireById = useMemo(
    () => new Map((center?.questionnaires ?? []).map((q) => [q.questionnaire_id, q])),
    [center],
  );
  const incompleteQuestionnaires = definitions.filter((q) => {
    const status = questionnaireById.get(q.id)?.status ?? 'not_started';
    return !COMPLETE_STATUSES.has(status);
  }).length;

  const account = center?.account;
  const privateProfile = center?.private_profile;
  const emailComplete = account?.email_verified === true;
  const identityDetailsComplete = Boolean(
    account?.full_name?.trim()
    && account?.username?.trim()
    && privateProfile?.country_iso2
    && privateProfile?.date_of_birth
    && (privateProfile?.intended_profiles?.length ?? 0) > 0,
  );
  const avatarComplete = Boolean(account?.avatar_url);
  const kycComplete = !center?.kyc_required || center.kyc_status === 'approved';
  const locationComplete = center?.location_verified === true;
  const questionnaireComplete = incompleteQuestionnaires === 0;
  const completionChecks = [emailComplete, identityDetailsComplete, locationComplete, kycComplete, questionnaireComplete];
  const completedChecks = completionChecks.filter(Boolean).length;
  const completionPercent = Math.round((completedChecks / completionChecks.length) * 100);
  const complete = Boolean(center && completedChecks === completionChecks.length);

  const answerFor = (q: QuestionnaireDefinition, key: string) => answers[q.questionnaire_key]?.[key];
  const setAnswer = (q: QuestionnaireDefinition, key: string, value: unknown) =>
    setAnswers((prev) => ({
      ...prev,
      [q.questionnaire_key]: { ...(prev[q.questionnaire_key] ?? {}), [key]: value },
    }));

  const visible = (q: QuestionnaireDefinition, question: QuestionnaireQuestion) => {
    const rule = question.conditional_rules as { question_key?: string; equals?: unknown };
    return !rule?.question_key || answerFor(q, rule.question_key) === rule.equals;
  };

  const saveQuestionnaire = async (q: QuestionnaireDefinition, submit: boolean) => {
    setBusy(`${q.id}:${submit ? 'submit' : 'draft'}`);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('save_my_questionnaire_answers', {
        p_questionnaire_id: q.id,
        p_answers: answers[q.questionnaire_key] ?? {},
        p_submit: submit,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: submit ? `${q.name} submitted for review.` : `${q.name} saved. You can finish it later.` });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Could not save questionnaire.' });
    } finally {
      setBusy(null);
    }
  };

  const saveSetupDetails = async () => {
    if (setupProfiles.length === 0) {
      setMessage({ type: 'error', text: 'Choose at least one way you want to use DRIGHT.' });
      return;
    }
    setBusy('setup');
    setMessage(null);
    try {
      const country = findCountry(setupCountry);
      const { error } = await supabase.rpc('update_my_onboarding_profile', {
        p_country_iso2: setupCountry || null,
        p_country_calling_code: country?.callingCode ?? null,
        p_date_of_birth: setupDob || null,
        p_intended_profiles: setupProfiles,
        p_interests: setupInterests.split(',').map((v) => v.trim()).filter(Boolean),
      });
      if (error) throw error;
      setEditingSetup(false);
      setMessage({ type: 'success', text: 'Signup details updated. Any newly applicable questionnaires are now shown below.' });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Could not update signup details.' });
    } finally {
      setBusy(null);
    }
  };

  const verifyLocation = async () => {
    if (!center?.location?.trim()) {
      setMessage({ type: 'error', text: 'Add your city/country in the Profile section before confirming your location.' });
      return;
    }
    setBusy('location');
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Authentication required');
      const { error } = await supabase.from('users').update({ location_verified: true }).eq('id', userId);
      if (error) throw error;
      setMessage({ type: 'success', text: 'Location confirmed.' });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Could not confirm location.' });
    } finally {
      setBusy(null);
    }
  };

  const uploadProfessional = async (file: File) => {
    setBusy('professional');
    try {
      const profileType = center?.private_profile?.intended_profiles?.[0];
      await uploadProfessionalDocument({ file, profileType, documentType: proType, title: file.name });
      setMessage({ type: 'success', text: 'Professional document uploaded for review.' });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Document upload failed.' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex items-center gap-3 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> Checking account completion…
      </div>
    );
  }
  if (!center) return message ? <Notice {...message} /> : null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${complete ? 'bg-green-50 dark:bg-green-950/30' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
            {complete ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : <Sparkles className="w-6 h-6 text-amber-600" />}
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Complete your DRIGHT profile</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Anything skipped during signup stays here until you finish it. You can continue using DRIGHT, but restricted actions remain gated.
            </p>
            <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${completionPercent}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completionPercent}% complete</p>
          </div>
          <span className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${complete ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
            {complete ? 'Complete' : 'Action needed'}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
          <ChecklistCard
            icon={<Camera />}
            label="Profile picture"
            value={avatarComplete ? 'Added' : 'Recommended'}
            complete={avatarComplete}
            optional
            action={!avatarComplete ? <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">Add in Profile</span> : undefined}
          />
          <ChecklistCard
            icon={<Mail />}
            label="Email address"
            value={emailComplete ? 'Verified' : 'Verification needed'}
            complete={emailComplete}
            action={!emailComplete ? <a href="/verify-email" className="text-xs font-semibold text-primary-600 dark:text-primary-400">Verify</a> : undefined}
          />
          <ChecklistCard
            icon={<UserRound />}
            label="Signup details"
            value={identityDetailsComplete ? `${countryFlag(privateProfile?.country_iso2 || '')} Details complete` : 'Details missing'}
            complete={identityDetailsComplete}
            action={<button type="button" onClick={() => setEditingSetup((v) => !v)} className="text-xs font-semibold text-primary-600 dark:text-primary-400">{editingSetup ? 'Close' : 'Edit'}</button>}
          />
          <ChecklistCard
            icon={<MapPin />}
            label="Location"
            value={locationComplete ? 'Verified' : center.location ? 'Not verified' : 'Not added'}
            complete={locationComplete}
            action={!locationComplete ? (
              <button onClick={() => void verifyLocation()} disabled={busy === 'location'} className="text-xs font-semibold text-primary-600 dark:text-primary-400 disabled:opacity-50">
                {busy === 'location' ? 'Checking…' : center.location ? 'Confirm' : 'Add above'}
              </button>
            ) : undefined}
          />
          <ChecklistCard
            icon={<ShieldCheck />}
            label="KYC / verification"
            value={center.kyc_required ? `${pretty(center.kyc_status)} • ${pretty(center.kyc_level)}` : `Optional • ${pretty(center.kyc_level)}`}
            complete={kycComplete}
            action={!kycComplete ? <a href="/settings?tab=verification" className="text-xs font-semibold text-primary-600 dark:text-primary-400">Open KYC</a> : undefined}
          />
          <ChecklistCard
            icon={<FileText />}
            label="Questionnaires"
            value={questionnaireComplete ? 'Completed' : `${incompleteQuestionnaires} to finish`}
            complete={questionnaireComplete}
            action={!questionnaireComplete ? <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">Continue below</span> : undefined}
          />
        </div>
      </section>

      {editingSetup && !compact && (
        <section className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-950/20 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Signup details & DRIGHT profiles</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Complete or update anything you skipped. Adding a profile can add its questionnaire and KYC requirements; it does not automatically grant privileged staff roles.
              </p>
            </div>
            <Pencil className="w-5 h-5 text-primary-600 shrink-0" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
              <select value={setupCountry} onChange={(e) => setSetupCountry(e.target.value)} className="input-base bg-white dark:bg-gray-800">
                {COUNTRIES.map((country) => (
                  <option key={country.iso2} value={country.iso2}>{countryFlag(country.iso2)} {country.name} {country.callingCode}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date of birth</label>
              <input type="date" value={setupDob} onChange={(e) => setSetupDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="input-base" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Private by default. Used for server-side eligibility checks.</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How you want to use DRIGHT</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PROFILE_OPTIONS.map((option) => {
                const selected = setupProfiles.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSetupProfiles((prev) => selected ? prev.filter((v) => v !== option.value) : [...prev, option.value])}
                    className={`p-3 rounded-xl border text-left transition-colors ${selected ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{option.label}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-primary-600" />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Interests</label>
            <input
              value={setupInterests}
              onChange={(e) => setSetupInterests(e.target.value)}
              placeholder="Technology, fashion, courses, services"
              className="input-base"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Separate interests with commas.</p>
          </div>

          <button
            type="button"
            onClick={() => void saveSetupDetails()}
            disabled={busy !== null}
            className="mt-5 w-full sm:w-auto px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === 'setup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save profile setup
          </button>
        </section>
      )}

      {message && <Notice {...message} />}

      {!compact && definitions.length > 0 && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Questionnaires & applications</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Every questionnaire you skipped remains here. Save a draft at any time and continue later.
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {definitions.map((q) => {
              const state = questionnaireById.get(q.id);
              const status = state?.status ?? 'not_started';
              const open = expanded === q.id;
              const done = COMPLETE_STATUSES.has(status);
              return (
                <div key={q.id}>
                  <button type="button" onClick={() => setExpanded(open ? null : q.id)} className="w-full p-4 sm:p-5 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${done ? 'bg-green-50 dark:bg-green-950/30' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
                      {done ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{q.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pretty(q.applicable_profile_type)} • {pretty(status)}</p>
                    </div>
                    {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>
                  {open && (
                    <div className="px-4 sm:px-5 pb-5 bg-gray-50/60 dark:bg-gray-900/30">
                      {state?.user_visible_reason && (
                        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
                          Reviewer note: {state.user_visible_reason}
                        </div>
                      )}
                      <div className="space-y-4 pt-4">
                        {q.questions.filter((question) => visible(q, question)).map((question) => (
                          <QuestionEditor
                            key={question.id}
                            question={question}
                            value={answerFor(q, question.question_key)}
                            onChange={(value) => setAnswer(q, question.question_key, value)}
                          />
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 mt-5">
                        <button type="button" onClick={() => void saveQuestionnaire(q, false)} disabled={busy !== null} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
                          <Save className="w-4 h-4" /> Save & finish later
                        </button>
                        <button type="button" onClick={() => void saveQuestionnaire(q, true)} disabled={busy !== null} className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
                          {busy === `${q.id}:submit` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Submit questionnaire
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!compact && definitions.length === 0 && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Questionnaires & applications</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No questionnaire is currently required for your selected DRIGHT profiles.</p>
        </section>
      )}

      {!compact && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Professional documents</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            CV/resume and professional evidence are optional for buyers unless a later role or action specifically requires them. You can add them whenever needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <select value={proType} onChange={(e) => setProType(e.target.value)} className="input-base sm:max-w-[220px]">
              <option value="cv">CV</option>
              <option value="resume">Resume</option>
              <option value="certificate">Certificate</option>
              <option value="qualification">Qualification</option>
              <option value="portfolio">Portfolio document</option>
              <option value="business_registration">Business registration</option>
              <option value="media_kit">Media kit</option>
            </select>
            <label className={`flex-1 px-4 py-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 text-sm font-semibold text-center cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950/20 ${busy === 'professional' ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4 inline mr-1" /> Upload document
              <input type="file" className="hidden" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadProfessional(file);
                e.currentTarget.value = '';
              }} />
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {center.professional_documents_count} professional document{center.professional_documents_count === 1 ? '' : 's'} currently stored in your private DRIGHT document area.
          </p>
        </section>
      )}
    </div>
  );
}

function ChecklistCard({
  icon, label, value, complete, optional = false, action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  complete: boolean;
  optional?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        {label}
        {optional && <span className="ml-auto text-[10px] uppercase tracking-wide">Optional</span>}
      </div>
      <div className="flex items-end gap-2 mt-2">
        <span className={`flex-1 text-sm font-semibold ${complete ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
        {action}
      </div>
    </div>
  );
}

function Notice({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div className={`rounded-xl p-3 border text-sm flex items-start gap-2 ${type === 'success'
      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300'
      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'}`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
      <span>{text}</span>
    </div>
  );
}

function QuestionEditor({ question, value, onChange }: { question: QuestionnaireQuestion; value: unknown; onChange: (value: unknown) => void }) {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  const label = (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {question.label}{question.is_required && <span className="text-red-500"> *</span>}
    </label>
  );
  const base = 'input-base';
  if (question.answer_type === 'yes_no') {
    return <div>{label}<select className={base} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select></div>;
  }
  if (question.answer_type === 'single_select' && options.length) {
    return <div>{label}<select className={base} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select></div>;
  }
  if (question.answer_type === 'multi_select' && options.length) {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <div>{label}<div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" onClick={() => onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option])} className={`px-3 py-2 rounded-full border text-sm ${selected.includes(option) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>{pretty(option)}</button>)}</div></div>;
  }
  if (question.answer_type === 'long_text') {
    return <div>{label}<textarea rows={4} className={`${base} resize-y`} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />{question.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{question.description}</p>}</div>;
  }
  if (question.answer_type === 'multi_select') {
    return <div>{label}<input className={base} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => onChange(e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} placeholder="Separate entries with commas" /></div>;
  }
  const type = question.answer_type === 'number' ? 'number' : question.answer_type === 'date' ? 'date' : question.answer_type === 'url' ? 'url' : question.answer_type === 'email' ? 'email' : 'text';
  return <div>{label}<input className={base} type={type} value={String(value ?? '')} onChange={(e) => onChange(type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />{question.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{question.description}</p>}</div>;
}

function pretty(value: string) {
  return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
