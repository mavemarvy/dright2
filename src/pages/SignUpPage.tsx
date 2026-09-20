import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Phone, User, ArrowRight, ArrowLeft, Loader2, AtSign, Calendar, Briefcase, FileText, CheckCircle2, XCircle, Search, Upload, ShieldCheck, Sparkles, Clock3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPendingRedirect, clearPendingRedirect } from '../lib/affiliate';
import TurnstileWidget from '../components/TurnstileWidget';
import { DrightMark, DrightWordmark } from '../components/DrightBrand';
import { verifyTurnstileToken } from '../lib/security/turnstile';
import { supabase } from '../lib/supabase';
import { COUNTRIES, countryFlag, findCountry } from '../lib/countries';
import {
  PROFILE_OPTIONS,
  checkUsernameAvailability,
  loadAgeRules,
  loadPublicKycRequirements,
  loadSignupQuestionnaires,
  uploadProfessionalDocument,
  calculateAge,
  minimumAgeForProfile,
  createPendingOnboardingToken,
  saveSignupOnboardingDraft,
  claimPendingSignupOnboarding,
} from '../lib/onboarding';
import type { AgeRule, QuestionnaireDefinition, QuestionnaireQuestion, PublicKycRequirement, UsernameAvailability } from '../lib/onboarding';
import { createKycProfile, createKycSubmission, uploadKycDocument } from '../lib/kycHooks';
import {
  claimPendingDrightStarterPurchase,
  getDrightStarterSignupEligibility,
  getPendingDrightStarterPurchase,
  isDrightStarterSignupFunnelRequired,
  setPendingDrightStarterPurchase,
} from '../lib/drightStarter';
import { KYC_DOC_TYPE_LABELS } from '../lib/kycTypes';

type Answers = Record<string, Record<string, unknown>>;
type ProFile = { file: File; documentType: string; title: string };

const STEPS = ['Account', 'Identity', 'Use DRIGHT', 'Questionnaire', 'Interests', 'Documents', 'Review'];
const DISCOVERY_INTERESTS = ['Products', 'Services', 'Courses', 'Jobs', 'Tasks', 'Creators', 'Communities', 'Technology', 'Business', 'Fashion', 'Home', 'Education', 'Entertainment'];

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pendingStarterPurchase = getPendingDrightStarterPurchase();
  const starterReference = (searchParams.get('starter_reference') || pendingStarterPurchase?.reference || '').trim();
  const starterFunnelRequired = isDrightStarterSignupFunnelRequired();
  const starterFlow = Boolean(starterReference) || starterFunnelRequired;

  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameAvailability | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [countryIso, setCountryIso] = useState('NG');
  const [countryQuery, setCountryQuery] = useState('');
  const [dob, setDob] = useState('');
  const [profiles, setProfiles] = useState<string[]>(['buyer']);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireDefinition[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [proDocs, setProDocs] = useState<ProFile[]>([]);
  const [proType, setProType] = useState('cv');
  const [kycFiles, setKycFiles] = useState<Record<string, File>>({});
  const [kycRequirements, setKycRequirements] = useState<PublicKycRequirement[]>([]);
  const [ageRules, setAgeRules] = useState<AgeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [starterGateChecking, setStarterGateChecking] = useState(false);
  const [starterGateVerified, setStarterGateVerified] = useState(!starterFlow);
  const [starterGateMessage, setStarterGateMessage] = useState<string | null>(starterFlow ? 'Verifying your DRIGHT Starter payment…' : null);
  const [starterEmailLocked, setStarterEmailLocked] = useState(false);

  const country = findCountry(countryIso) ?? COUNTRIES.find((c) => c.iso2 === 'NG')!;
  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const matches = q ? COUNTRIES.filter((c) => (`${c.name} ${c.iso2} ${c.callingCode}`).toLowerCase().includes(q)) : COUNTRIES;
    if (q) return matches;
    return [...matches].sort((a, b) => a.iso2 === countryIso ? -1 : b.iso2 === countryIso ? 1 : a.name.localeCompare(b.name));
  }, [countryQuery, countryIso]);

  const selectedKycRules = kycRequirements.filter((r) => profiles.includes(r.user_type));
  const requiredKycTypes = Array.from(new Set(selectedKycRules.filter((r) => r.is_required).flatMap((r) => r.required_document_types ?? [])));
  const kycRequired = selectedKycRules.some((r) => r.is_required);

  useEffect(() => {
    void Promise.all([loadAgeRules().then(setAgeRules), loadPublicKycRequirements().then(setKycRequirements)]).catch(() => undefined);
  }, []);

  useEffect(() => {
    const pendingStarter = getPendingDrightStarterPurchase();
    if (pendingStarter?.email) {
      setEmail(pendingStarter.email);
      if (starterFlow && (!pendingStarter.reference || pendingStarter.reference === starterReference)) {
        setStarterEmailLocked(true);
      }
    }
  }, [starterFlow, starterReference]);

  useEffect(() => {
    if (!starterFlow) {
      setStarterGateVerified(true);
      setStarterGateMessage(null);
      setStarterGateChecking(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setStarterGateVerified(false);
      setStarterGateMessage('Enter the same email used for the DRIGHT Starter purchase.');
      return;
    }

    setStarterGateChecking(true);
    setStarterGateVerified(false);
    const timer = window.setTimeout(async () => {
      const eligibility = await getDrightStarterSignupEligibility(starterReference, normalizedEmail);
      setStarterGateVerified(eligibility.eligible);
      setStarterGateMessage(eligibility.message);
      if (eligibility.eligible) setPendingDrightStarterPurchase(starterReference, normalizedEmail);
      setStarterGateChecking(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [starterFlow, starterReference, email]);

  useEffect(() => {
    void loadSignupQuestionnaires(profiles).then(setQuestionnaires).catch((e) => setError(e instanceof Error ? e.message : 'Could not load questionnaires'));
  }, [profiles]);

  useEffect(() => {
    const raw = username.trim();
    setSuggestions([]);
    if (raw.length < 3) {
      setUsernameStatus(null);
      return;
    }
    setUsernameChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const status = await checkUsernameAvailability(raw);
        setUsernameStatus(status);
        if (!status.available) {
          const base = status.normalized || raw.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const candidates = [`${base}${new Date().getFullYear().toString().slice(-2)}`, `${base}_p`, `${base}${countryIso.toLowerCase()}`];
          const checked = await Promise.all(candidates.map(async (c) => ({ c, status: await checkUsernameAvailability(c) })));
          setSuggestions(checked.filter((x) => x.status.available).map((x) => x.status.normalized).slice(0, 3));
        }
      } catch {
        setUsernameStatus(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [username, countryIso]);

  useEffect(() => {
    if (step === STEPS.length - 1) {
      setTurnstileToken(null);
      setTurnstileError(null);
    }
  }, [step]);

  const answerFor = (q: QuestionnaireDefinition, key: string) => answers[q.questionnaire_key]?.[key];
  const setAnswer = (q: QuestionnaireDefinition, key: string, value: unknown) => setAnswers((prev) => ({ ...prev, [q.questionnaire_key]: { ...(prev[q.questionnaire_key] ?? {}), [key]: value } }));
  const visible = (q: QuestionnaireDefinition, question: QuestionnaireQuestion) => {
    const rule = question.conditional_rules as { question_key?: string; equals?: unknown };
    return !rule?.question_key || answerFor(q, rule.question_key) === rule.equals;
  };

  const questionnaireComplete = (q: QuestionnaireDefinition) => {
    for (const question of q.questions) {
      if (!visible(q, question) || !question.is_required) continue;
      const value = answerFor(q, question.question_key);
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return false;
    }
    return true;
  };

  const completeQuestionnaires = questionnaires.filter(questionnaireComplete).length;
  const deferredQuestionnaires = Math.max(0, questionnaires.length - completeQuestionnaires);

  const ageFailure = () => {
    if (!dob) return null;
    const age = calculateAge(dob);
    for (const profile of profiles) {
      const rule = ageRules.find((r) => r.profile_type === profile);
      const minimum = minimumAgeForProfile(rule, countryIso);
      if (rule && age < minimum) return { profile, minimum };
    }
    return null;
  };

  const handleTurnstileVerified = (token: string) => {
    setTurnstileToken(token);
    setTurnstileError(null);
  };
  const handleTurnstileError = (message: string) => {
    setTurnstileToken(null);
    setTurnstileError(message);
  };

  const validateStep = () => {
    setError(null);
    if (step === 0) {
      if (!fullName.trim() || !email.trim() || password.length < 6) return setError('Enter your name, email and a password of at least 6 characters.'), false;
      if (password !== confirmPassword) return setError('Passwords do not match.'), false;
      if (!turnstileToken) return setError('Please complete the Cloudflare security verification before continuing.'), false;
      if (starterFlow && !starterGateVerified) return setError(starterGateMessage || 'Verified DRIGHT Starter payment is required before you can continue signup.'), false;
    }
    if (step === 1) {
      if (!usernameStatus?.available) return setError('Choose a confirmed available username.'), false;
      if (!dob) return setError('Date of birth is required.'), false;
    }
    if (step === 2) {
      if (profiles.length === 0) return setError('Choose at least one way you want to use DRIGHT.'), false;
      const failed = ageFailure();
      if (failed) return setError(`${PROFILE_OPTIONS.find((p) => p.value === failed.profile)?.label ?? failed.profile} requires a minimum age of ${failed.minimum} in your selected country.`), false;
    }
    // Questionnaires and KYC documents are intentionally non-blocking at signup.
    // The server stores incomplete questionnaires as drafts and Settings prompts the user later.
    if (step === 6) {
      const failed = ageFailure();
      if (failed) return setError(`${PROFILE_OPTIONS.find((p) => p.value === failed.profile)?.label ?? failed.profile} requires a minimum age of ${failed.minimum}.`), false;
      if (!turnstileToken) return setError('Please complete the final Cloudflare security verification.'), false;
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const skipCurrent = () => { setError(null); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const back = () => { setError(null); setStep((s) => Math.max(0, s - 1)); };
  const toggleProfile = (value: string) => setProfiles((prev) => prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]);
  const toggleInterest = (value: string) => setInterests((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);

  const handleCreate = async () => {
    if (!validateStep()) return;
    if (!turnstileToken) return setError('Please complete the CAPTCHA challenge.');
    setLoading(true);
    setError(null);
    try {
      const turnstile = await verifyTurnstileToken(turnstileToken, 'signup');
      if (!turnstile.success) throw new Error(turnstile.error || 'CAPTCHA verification failed');

      if (starterFlow) {
        const eligibility = await getDrightStarterSignupEligibility(starterReference, email);
        if (!eligibility.eligible) {
          setStarterGateVerified(false);
          setStarterGateMessage(eligibility.message);
          throw new Error(eligibility.message);
        }
        setStarterGateVerified(true);
        setStarterGateMessage(eligibility.message);
        setPendingDrightStarterPurchase(starterReference, email);
      }

      const onboardingToken = createPendingOnboardingToken();
      await saveSignupOnboardingDraft({ token: onboardingToken, email, username, countryIso2: country.iso2, callingCode: country.callingCode, dateOfBirth: dob, intendedProfiles: profiles, interests, answers });

      const phoneValue = normalizePhone(phone, country.callingCode);
      const result = await signUp(email, password, fullName.trim(), phoneValue, false, country.name, 'USD', starterFlow ? starterReference : undefined);
      if (result.error) throw result.error;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAwaitingEmail(true);
        setSuccess(true);
        return;
      }

      await claimPendingSignupOnboarding(onboardingToken);
      const starterClaim = await claimPendingDrightStarterPurchase();
      if (starterClaim.error) console.warn('Starter purchase claim pending:', starterClaim.error);

      for (const item of proDocs) {
        await uploadProfessionalDocument({ file: item.file, profileType: profiles[0], documentType: item.documentType, title: item.title });
      }

      // Starting KYC at signup is optional. A KYC profile/submission is created only
      // when the user actually selected at least one identity file here.
      if (Object.keys(kycFiles).length > 0) {
        const primary = selectedKycRules.find((r) => r.is_required)?.user_type ?? profiles[0] ?? 'buyer';
        const kycProfile = await createKycProfile(user.id, primary, profiles);
        if (kycProfile) {
          const submission = await createKycSubmission(kycProfile.id, user.id);
          if (submission) {
            for (const [type, file] of Object.entries(kycFiles)) {
              await uploadKycDocument(submission.id, user.id, type, file, { issuingCountry: country.iso2 });
            }
          }
        }
      }

      const redirect = getPendingRedirect() || '/';
      clearPendingRedirect();
      setSuccess(true);
      window.setTimeout(() => navigate(redirect), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  if (starterFlow && !starterGateVerified) {
    const verifying = starterGateChecking && Boolean(starterReference);
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 flex items-center justify-center">
        <section className="w-full max-w-md rounded-3xl bg-white dark:bg-gray-900 shadow-2xl p-6 sm:p-8 text-center">
          <DrightMark size={64} className="mx-auto" />
          <div className={`w-14 h-14 mx-auto mt-6 rounded-full flex items-center justify-center ${verifying ? 'bg-primary-50 dark:bg-primary-950/40' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
            {verifying
              ? <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
              : <ShieldCheck className="w-7 h-7 text-amber-600" />}
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-4">
            {verifying ? 'Verifying Starter payment' : 'Payment required before signup'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-6">
            {verifying
              ? 'DRIGHT is checking the payment with the server. The account form will unlock only after the payment is verified.'
              : starterReference
                ? (starterGateMessage || 'This Starter payment is not verified yet.')
                : 'You entered signup from DRIGHT Starter Access. Complete the Starter purchase first; signup remains locked until DRIGHT verifies the payment.'}
          </p>

          <div className="mt-6 grid gap-3">
            {starterReference ? (
              <Link
                to={`/dright/starter/payment?reference=${encodeURIComponent(starterReference)}`}
                className="min-h-[50px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center"
              >
                Verify payment
              </Link>
            ) : (
              <Link
                to="/dright/starter"
                className="min-h-[50px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center"
              >
                Return to Starter checkout
              </Link>
            )}
            <Link to="/sign-in" className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              Already have an account? Sign in
            </Link>
          </div>

          <p className="mt-5 text-xs text-gray-400">
            The signup form is intentionally unavailable until Supabase confirms a successful DRIGHT Starter payment for the purchase reference and email.
          </p>
        </section>
      </main>
    );
  }

  if (success) {
    return <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400"><motion.div initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-10 text-center max-w-md w-full"><div className="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-9 h-9 text-white" /></div><h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{awaitingEmail ? 'Verify your email' : 'Account created'}</h2><p className="text-gray-500 dark:text-gray-400 mt-2">{awaitingEmail ? 'Your private onboarding draft is securely saved for 24 hours. Verify your email with the Supabase confirmation email or the 6-digit code option. Incomplete questionnaires and KYC can then be finished in Settings → Verification.' : deferredQuestionnaires > 0 || (kycRequired && Object.keys(kycFiles).length === 0) ? 'Your account is ready. Any questionnaire or KYC item you skipped is saved for later in Settings → Verification.' : 'Your onboarding information is linked to your DRIGHT identity. You can review it later in Settings → Verification.'}</p>{awaitingEmail && <Link to={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`} className="inline-flex mt-6 px-5 py-3 bg-primary-600 text-white rounded-xl font-semibold">Enter verification code</Link>}</motion.div></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400">
      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-10">
            <div className="text-center mb-5"><Link to="/welcome" className="inline-flex flex-col items-center"><DrightMark size={68} title="DRIGHT" /><DrightWordmark className="mt-2" /></Link><p className="text-gray-500 dark:text-gray-400 mt-2">Create your account</p></div>
            <div className="mb-7"><div className="flex justify-between text-xs text-gray-400 mb-2"><span>{STEPS[step]}</span><span>{step + 1} / {STEPS.length}</span></div><div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-primary-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div></div>
            {error && <div className="bg-error-muted text-error rounded-xl p-4 mb-5">{error}</div>}

            {starterFlow && (
              <div className={`mb-5 rounded-2xl border p-4 ${starterGateVerified ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'}`}>
                <div className="flex items-start gap-3">
                  {starterGateChecking ? <Loader2 className="w-5 h-5 animate-spin text-amber-600 mt-0.5" /> : <ShieldCheck className={`w-5 h-5 mt-0.5 ${starterGateVerified ? 'text-emerald-600' : 'text-amber-600'}`} />}
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">Paid DRIGHT Starter signup</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {starterGateChecking ? 'Checking the payment with DRIGHT…' : starterGateMessage}
                    </p>
                    {starterGateVerified && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        DRIGHT will recheck this verified payment again immediately before account creation.
                      </p>
                    )}
                    {!starterGateVerified && !starterGateChecking && (
                      <Link to="/dright/starter" className="inline-flex mt-2 text-sm font-bold text-primary-600 dark:text-primary-300">
                        Return to Starter checkout
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 0 && <div className="space-y-4">
              <Field label="Full Name" icon={<User />}><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field-input" placeholder="John Doe" autoComplete="name" /></Field>
              <Field label="Email address" icon={<Mail />}><input type="email" value={email} readOnly={starterFlow && starterEmailLocked} onChange={(e) => setEmail(e.target.value)} className={`field-input ${starterFlow && starterEmailLocked ? 'opacity-80 cursor-not-allowed' : ''}`} placeholder="you@example.com" autoComplete="email" /></Field>{starterFlow && <p className="helper -mt-3">Starter signup must use the exact email address attached to the verified purchase.</p>}
              <div><label className="label">Country</label><div className="mb-2 px-3 py-3 rounded-xl border border-primary-200 bg-primary-50/60 dark:bg-primary-950/30 dark:border-primary-900 flex items-center gap-3"><span className="text-xl">{countryFlag(country.iso2)}</span><span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{country.name}</span><span className="text-sm text-primary-700 dark:text-primary-300">{country.callingCode}</span></div><div className="relative mb-2"><Search className="icon" /><input value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} className="base-input pl-12" placeholder="Search all countries, ISO codes or calling codes" autoComplete="country-name" /></div><div className="max-h-52 overflow-auto border border-gray-100 dark:border-gray-700 rounded-xl" role="listbox" aria-label="Country selection">{filteredCountries.map((c) => <button key={c.iso2} type="button" onClick={() => { setCountryIso(c.iso2); setCountryQuery(''); }} className={`w-full px-3 py-2.5 flex items-center gap-3 text-left text-sm ${countryIso === c.iso2 ? 'bg-primary-50 dark:bg-primary-950' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}><span className="text-xl">{countryFlag(c.iso2)}</span><span className="flex-1 text-gray-900 dark:text-gray-100">{c.name}</span><span className="text-gray-500 dark:text-gray-400">{c.callingCode}</span></button>)}</div><p className="helper">The selected country controls your international phone prefix, age rules and regional verification requirements.</p></div>
              <Field label="Phone (optional)" icon={<Phone />}><div className="flex items-center"><span className="pl-12 pr-2 text-sm font-semibold text-primary-600 dark:text-primary-300">{country.callingCode}</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1 py-4 pr-4 outline-none bg-transparent text-gray-900 dark:text-gray-100" placeholder="Phone number" autoComplete="tel-national" /></div></Field>
              <div className="grid sm:grid-cols-2 gap-4"><Field label="Password" icon={<Lock />}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" placeholder="6+ characters" autoComplete="new-password" /></Field><Field label="Confirm password" icon={<Lock />}><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="field-input" placeholder="Repeat password" autoComplete="new-password" /></Field></div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-3"><div className="flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-primary-600" /><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cloudflare security verification</span></div><TurnstileWidget action="signup" onVerified={handleTurnstileVerified} onError={handleTurnstileError} />{turnstileToken && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Security check completed</p>}{turnstileError && <p className="text-xs text-red-500 mt-1">{turnstileError}</p>}</div>
            </div>}

            {step === 1 && <div className="space-y-5"><div><label className="label">Username</label><div className="relative"><AtSign className="icon" /><input value={username} onChange={(e) => setUsername(e.target.value)} className="base-input pl-12" placeholder="marvelous" autoCapitalize="none" autoComplete="username" /></div><div className="mt-2 text-xs">{usernameChecking ? <span className="text-gray-400">Checking…</span> : usernameStatus?.available ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> @{usernameStatus.normalized} is available</span> : usernameStatus ? <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Username unavailable</span> : null}</div>{suggestions.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{suggestions.map((s) => <button key={s} type="button" onClick={() => setUsername(s)} className="px-2.5 py-1 text-xs rounded-full border border-primary-200 text-primary-700 dark:text-primary-300">@{s}</button>)}</div>}</div><div><label className="label">Date of birth <span className="text-gray-400 font-normal">(private)</span></label><div className="relative"><Calendar className="icon" /><input type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="base-input pl-12" /></div><p className="helper">Your DOB is used for eligibility and is not public by default.</p></div><div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm flex items-center gap-3"><span className="text-xl">{countryFlag(country.iso2)}</span><div className="flex-1"><div className="font-semibold text-gray-900 dark:text-gray-100">{country.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">Phone prefix {country.callingCode}</div></div><button type="button" onClick={() => setStep(0)} className="text-xs font-semibold text-primary-600 dark:text-primary-300">Change</button></div></div>}

            {step === 2 && <div><div className="flex items-center gap-2 mb-2"><Briefcase className="w-5 h-5 text-primary-600" /><h2 className="font-bold text-gray-900 dark:text-gray-100">How do you want to use DRIGHT?</h2></div><p className="helper mb-4">One account can hold multiple capabilities. Age and verification requirements are evaluated for every capability you choose.</p><div className="grid sm:grid-cols-2 gap-3">{PROFILE_OPTIONS.map((p) => <button key={p.value} type="button" onClick={() => toggleProfile(p.value)} className={`text-left p-4 rounded-2xl border-2 transition-colors ${profiles.includes(p.value) ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-gray-100 dark:border-gray-700'}`}><div className="flex items-center justify-between"><span className="font-semibold text-gray-900 dark:text-gray-100">{p.label}</span>{profiles.includes(p.value) && <CheckCircle2 className="w-5 h-5 text-primary-600" />}</div><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p.description}</p></button>)}</div></div>}

            {step === 3 && <div className="space-y-6"><div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4 flex gap-3"><Clock3 className="w-5 h-5 text-blue-600 dark:text-blue-300 shrink-0 mt-0.5" /><div><p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Answer now or finish later</p><p className="text-xs text-blue-700 dark:text-blue-300 mt-1">You can skip any questionnaire during signup. Incomplete answers are saved as drafts and will appear in Settings → Verification.</p></div></div>{questionnaires.length === 0 ? <div className="text-center py-8 text-gray-500 dark:text-gray-400">No additional questionnaire is required for the selected profile.</div> : questionnaires.map((q) => <section key={q.id}><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900 dark:text-gray-100">{q.name}</h3><span className={`text-xs px-2 py-1 rounded-full ${questionnaireComplete(q) ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{questionnaireComplete(q) ? 'Ready to submit' : 'Can finish later'}</span></div>{q.description && <p className="helper mb-3">{q.description}</p>}<div className="space-y-4 mt-3">{q.questions.filter((question) => visible(q, question)).map((question) => <QuestionField key={question.id} question={question} value={answerFor(q, question.question_key)} onChange={(value) => setAnswer(q, question.question_key, value)} />)}</div></section>)}<button type="button" onClick={skipCurrent} className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm">Skip questionnaires for now</button></div>}

            {step === 4 && <div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary-600" /><h2 className="font-bold text-gray-900 dark:text-gray-100">Interests</h2></div><p className="helper mb-4">Choose what should help personalize discovery and recommendations. You can change this later.</p><div className="flex flex-wrap gap-2">{DISCOVERY_INTERESTS.map((item) => <button key={item} type="button" onClick={() => toggleInterest(item)} className={`px-3 py-2 rounded-full text-sm border ${interests.includes(item) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>{item}</button>)}</div></div>}

            {step === 5 && <div className="space-y-6"><div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4 flex gap-3"><Clock3 className="w-5 h-5 text-blue-600 dark:text-blue-300 shrink-0 mt-0.5" /><div><p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Documents can be completed later</p><p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Professional documents and KYC uploads do not block account creation. Required KYC only gates the actions that actually require verification.</p></div></div><section><h3 className="font-bold text-gray-900 dark:text-gray-100">Professional documents <span className="text-gray-400 font-normal">optional</span></h3><p className="helper">CVs, certificates and portfolio documents use separate private storage. Buyers do not need a CV just to create or use a buyer account.</p><div className="flex flex-col sm:flex-row gap-2 mt-3"><select value={proType} onChange={(e) => setProType(e.target.value)} className="input-base sm:max-w-[220px]"><option value="cv">CV</option><option value="resume">Resume</option><option value="certificate">Certificate</option><option value="qualification">Qualification</option><option value="portfolio">Portfolio document</option><option value="business_registration">Business registration</option><option value="media_kit">Media kit</option></select><label className="flex-1 cursor-pointer px-4 py-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-300 text-sm font-medium text-center"><Upload className="w-4 h-4 inline mr-1" /> Add document<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setProDocs((prev) => [...prev, { file: f, documentType: proType, title: f.name }]); e.currentTarget.value = ''; }} /></label></div>{proDocs.length > 0 && <div className="mt-3 space-y-2">{proDocs.map((d, i) => <div key={`${d.file.name}-${i}`} className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100"><FileText className="w-4 h-4" /><span className="flex-1 truncate">{d.file.name}</span><button type="button" onClick={() => setProDocs((prev) => prev.filter((_, x) => x !== i))} className="text-red-500">Remove</button></div>)}</div>}</section><section><div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary-600" /><h3 className="font-bold text-gray-900 dark:text-gray-100">KYC / identity verification</h3></div>{kycRequired ? <p className="helper mt-1">KYC is required for at least one selected capability, but you may complete it after signup in Settings → Verification.</p> : <p className="helper mt-1">No mandatory KYC rule currently applies. You can still verify later if you want a stronger trust level.</p>}{requiredKycTypes.length === 0 && kycRequired && <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">KYC is required for a selected capability, but the policy has no fixed document set. Settings → Verification will show the applicable manual requirements.</div>}<div className="space-y-3 mt-3">{requiredKycTypes.map((type) => <label key={type} className="block p-3 rounded-xl border border-gray-200 dark:border-gray-700"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{KYC_DOC_TYPE_LABELS[type] ?? type}</span><span className="text-xs text-gray-500 dark:text-gray-400">Optional now</span></div><input type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm text-gray-700 dark:text-gray-300" onChange={(e) => { const f = e.target.files?.[0]; if (f) setKycFiles((prev) => ({ ...prev, [type]: f })); }} />{kycFiles[type] && <p className="text-xs text-green-600 mt-1">Selected: {kycFiles[type].name}</p>}</label>)}</div></section><button type="button" onClick={skipCurrent} className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm">Skip documents & KYC for now</button></div>}

            {step === 6 && <div className="space-y-4"><h2 className="font-bold text-xl text-gray-900 dark:text-gray-100">Review & create account</h2><ReviewRow label="Username" value={`@${usernameStatus?.normalized ?? username}`} /><ReviewRow label="Country" value={`${countryFlag(country.iso2)} ${country.name} ${country.callingCode}`} /><ReviewRow label="Intended profiles" value={profiles.map((p) => PROFILE_OPTIONS.find((o) => o.value === p)?.label ?? p).join(', ')} /><ReviewRow label="Questionnaires" value={questionnaires.length === 0 ? 'None required' : deferredQuestionnaires > 0 ? `${completeQuestionnaires} ready • ${deferredQuestionnaires} saved for later` : `${completeQuestionnaires} ready to submit`} /><ReviewRow label="Professional documents" value={proDocs.length ? `${proDocs.length} selected` : 'Skipped • optional'} /><ReviewRow label="KYC" value={kycRequired ? Object.keys(kycFiles).length ? `${Object.keys(kycFiles).length} document(s) selected • remaining items can be completed later` : 'Required for selected capability • complete later in Settings' : 'Not currently required'} /><div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-3"><div className="flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-primary-600" /><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Final Cloudflare security check</span></div><TurnstileWidget action="signup" onVerified={handleTurnstileVerified} onError={handleTurnstileError} />{turnstileError && <p className="text-xs text-red-500 mt-1">{turnstileError}</p>}</div><p className="text-xs text-gray-500 dark:text-gray-400">DOB and questionnaire drafts are stored server-side. If email confirmation is required, an opaque one-time token on this device resumes onboarding after sign-in. Selected file contents are never saved in browser storage.</p></div>}

            <div className="flex gap-3 mt-8">{step > 0 && <button type="button" onClick={back} disabled={loading} className="px-5 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back</button>}<button type="button" onClick={step === STEPS.length - 1 ? () => void handleCreate() : next} disabled={loading || (starterFlow && starterGateChecking)} className="flex-1 py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{step === STEPS.length - 1 ? 'Create Account' : 'Continue'}<ArrowRight className="w-5 h-5" /></>}</button></div>
            <div className="mt-6 text-center"><p className="text-gray-500 dark:text-gray-400">Already have an account? <Link to="/sign-in" className="text-primary-600 dark:text-primary-300 font-semibold">Sign in</Link></p></div>
          </div>
        </motion.div>
      </div>
      <style>{`.label{display:block;font-size:.875rem;font-weight:500;color:var(--text-primary);margin-bottom:.5rem}.helper{font-size:.75rem;color:var(--text-secondary);margin-top:.25rem}.base-input{width:100%;padding-top:1rem;padding-bottom:1rem;padding-right:1rem;border:1px solid var(--border-color);border-radius:.75rem;outline:none;background:var(--bg-input);color:var(--text-primary)}.field-input{width:100%;padding:1rem 1rem 1rem 3rem;outline:none;background:transparent;color:var(--text-primary)}.icon{position:absolute;left:1rem;top:50%;transform:translateY(-50%);width:1.25rem;height:1.25rem;color:rgb(156 163 175)}`}</style>
    </div>
  );
}

function normalizePhone(raw: string, callingCode: string) {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, '');
  const countryDigits = callingCode.replace(/\D/g, '');
  if (!digits) return undefined;
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith(countryDigits) && digits.length > countryDigits.length + 4) return `+${digits}`;
  const local = digits.replace(/^0+/, '');
  return local ? `+${countryDigits}${local}` : undefined;
}

function Field({ label, icon, children }: { label: string; icon: ReactElement; children: ReactNode }) {
  return <div><label className="label">{label}</label><div className="relative border border-gray-200 dark:border-gray-700 rounded-xl focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900"><span className="icon">{icon}</span>{children}</div></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-500 dark:text-gray-400">{label}</span><span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:text-right">{value}</span></div>;
}

function QuestionField({ question, value, onChange }: { question: QuestionnaireQuestion; value: unknown; onChange: (value: unknown) => void }) {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  const label = <label className="label">{question.label}{question.is_required && <span className="text-red-500"> *</span>}</label>;
  if (question.answer_type === 'yes_no') return <div>{label}<select value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')} className="base-input px-3"><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select></div>;
  if (question.answer_type === 'single_select' && options.length) return <div>{label}<select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="base-input px-3"><option value="">Select…</option>{options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select></div>;
  if (question.answer_type === 'multi_select' && options.length) { const selected = Array.isArray(value) ? value.map(String) : []; return <div>{label}<div className="flex flex-wrap gap-2">{options.map((o) => <button key={o} type="button" onClick={() => onChange(selected.includes(o) ? selected.filter((v) => v !== o) : [...selected, o])} className={`px-3 py-2 rounded-full text-sm border ${selected.includes(o) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>{o.replace(/_/g, ' ')}</button>)}</div></div>; }
  if (question.answer_type === 'long_text') return <div>{label}<textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="base-input px-3 resize-none" />{question.description && <p className="helper">{question.description}</p>}</div>;
  if (question.answer_type === 'multi_select') return <div>{label}<input value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => onChange(e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} className="base-input px-3" placeholder="Separate entries with commas" /></div>;
  const type = question.answer_type === 'number' ? 'number' : question.answer_type === 'date' ? 'date' : question.answer_type === 'url' ? 'url' : question.answer_type === 'email' ? 'email' : 'text';
  return <div>{label}<input type={type} value={String(value ?? '')} onChange={(e) => onChange(type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} className="base-input px-3" />{question.description && <p className="helper">{question.description}</p>}</div>;
}
