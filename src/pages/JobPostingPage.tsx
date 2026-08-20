import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Plus, X, Loader2, CheckCircle, AlertCircle,
  Briefcase, Building2, MapPin, Calendar, DollarSign, Save,
  Eye, EyeOff, FileText, ListChecks, Users,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SUPPORTED_CURRENCIES, formatSalaryRange } from '../lib/currency';
import type { JobType, WorkSetup, CareerLevel } from '../lib/types';
import PostUploadConfirmation from '../components/PostUploadConfirmation';
import AIGenerateButton from '../components/ai/AIGenerateButton';

const JOB_CATEGORIES = [
  'Advertising & Marketing',
  'YouTube Automation',
  'Technology & Engineering',
  'Design & Creative',
  'Sales & Business Development',
  'Customer Support',
  'Finance & Accounting',
  'Content & Writing',
  'Education & Training',
  'Healthcare',
  'Legal',
  'Other',
];

const JOB_TYPES: JobType[] = ['Full-time', 'Part-time', 'Contract', 'Freelance'];
const WORK_SETUPS: WorkSetup[] = ['Remote', 'On-site', 'Hybrid'];
const CAREER_LEVELS: CareerLevel[] = ['Entry', 'Mid', 'Senior', 'Executive'];

const STEPS = [
  { id: 1, title: 'Job Details', icon: Briefcase },
  { id: 2, title: 'Company Info', icon: Building2 },
  { id: 3, title: 'Role Specifics', icon: Users },
  { id: 4, title: 'Requirements', icon: ListChecks },
  { id: 5, title: 'Description', icon: FileText },
  { id: 6, title: 'Preview & Publish', icon: Eye },
];

const DRAFT_KEY = 'job_posting_draft';

interface FormState {
  title: string;
  category: string;
  jobType: JobType;
  workSetup: WorkSetup;
  careerLevel: CareerLevel;
  region: string;
  companyName: string;
  companyDescription: string;
  minExperience: string;
  deadline: string;
  salaryMin: number | '';
  salaryMax: number | '';
  salaryCurrency: string;
  responsibilities: string[];
  requirements: string[];
  minQualification: string;
  description: string;
  applicationInstructions: string;
}

const INITIAL_FORM: FormState = {
  title: '',
  category: 'Advertising & Marketing',
  jobType: 'Full-time',
  workSetup: 'Remote',
  careerLevel: 'Mid',
  region: '',
  companyName: '',
  companyDescription: '',
  minExperience: '',
  deadline: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'NGN',
  responsibilities: ['', '', '', '', ''],
  requirements: ['', '', ''],
  minQualification: '',
  description: '',
  applicationInstructions: '',
};

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">Step {step} of {total}</p>
        <p className="text-sm text-gray-500">{STEPS[step - 1].title}</p>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map(s => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              s.id < step ? 'bg-success' : s.id === step ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 px-0.5">
        {STEPS.map(s => (
          <div key={s.id} className="flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              s.id < step ? 'bg-success text-white' : s.id === step ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {s.id < step ? '✓' : s.id}
            </div>
            <span className={`text-xs hidden md:block ${s.id === step ? 'text-primary-700 font-medium' : 'text-gray-400'}`}>{s.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobPreview({ form }: { form: FormState }) {
  const salaryDisplay = formatSalaryRange(Number(form.salaryMin) || 0, Number(form.salaryMax) || 0, form.salaryCurrency);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden text-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-indigo-700 p-5 text-white">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{form.category || 'Category'}</span>
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{form.jobType}</span>
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{form.workSetup}</span>
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{form.careerLevel}</span>
        </div>
        <h2 className="text-lg font-bold leading-tight">{form.title || 'Job Title'}</h2>
        <div className="flex flex-wrap gap-3 mt-2 text-primary-200 text-xs">
          {form.companyName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{form.companyName}</span>}
          {form.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{form.region}</span>}
          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{salaryDisplay}</span>
          {form.deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Deadline: {new Date(form.deadline).toLocaleDateString()}</span>}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Company */}
        {(form.companyName || form.companyDescription) && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Company Information</h3>
            {form.companyName && <p className="font-semibold text-gray-900">{form.companyName}</p>}
            {form.companyDescription && <p className="text-xs text-gray-600 mt-0.5">{form.companyDescription}</p>}
          </div>
        )}

        {/* Role Specs */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Role Specifics</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {form.minExperience && <span><span className="text-gray-500">Experience:</span> {form.minExperience}</span>}
            <span><span className="text-gray-500">Salary:</span> {salaryDisplay}</span>
            {form.deadline && <span><span className="text-gray-500">Deadline:</span> {new Date(form.deadline).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Responsibilities */}
        {form.responsibilities.filter(r => r.trim()).length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Key Responsibilities</h3>
            <ul className="space-y-1">
              {form.responsibilities.filter(r => r.trim()).map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="text-success mt-0.5 shrink-0">•</span> {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Requirements */}
        {form.requirements.filter(r => r.trim()).length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Requirements & Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {form.requirements.filter(r => r.trim()).map((req, i) => (
                <span key={i} className="text-xs bg-primary-50 text-primary-700 rounded-full px-2.5 py-0.5">{req}</span>
              ))}
            </div>
          </div>
        )}

        {/* Qualification */}
        {form.minQualification && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Minimum Qualification</h3>
            <p className="text-xs text-gray-700">{form.minQualification}</p>
          </div>
        )}

        {/* Description */}
        {form.description && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Job Description</h3>
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-6">{form.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JobPostingPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved ? JSON.parse(saved) : INITIAL_FORM;
    } catch {
      return INITIAL_FORM;
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [uploadedJobId, setUploadedJobId] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateListItem = (key: 'responsibilities' | 'requirements', index: number, value: string) => {
    const list = [...form[key]];
    list[index] = value;
    update(key, list);
  };

  const addListItem = (key: 'responsibilities' | 'requirements') => {
    update(key, [...form[key], '']);
  };

  const removeListItem = (key: 'responsibilities' | 'requirements', index: number) => {
    update(key, form[key].filter((_, i) => i !== index));
  };

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  // Auto-save draft as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }, 1000);
    return () => clearTimeout(timer);
  }, [form]);

  const validateStep = (): string | null => {
    if (step === 1) {
      if (form.title.trim().length < 10) return 'Job title must be at least 10 characters';
      if (!form.region.trim()) return 'Region/Location is required';
    }
    if (step === 2) {
      if (!form.companyName.trim()) return 'Company name is required';
    }
    if (step === 4) {
      const filled = form.responsibilities.filter(r => r.trim());
      if (filled.length < 5) return `Please add at least 5 responsibilities (you have ${filled.length})`;
      if (filled.length > 8) return 'Maximum 8 responsibilities allowed';
      if (form.requirements.filter(r => r.trim()).length < 1) return 'Please add at least 1 requirement/skill';
    }
    if (step === 5) {
      const wordCount = form.description.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 150) return `Description needs at least 150 words (${wordCount} written)`;
      if (wordCount > 300) return `Description is too long — max 300 words (${wordCount} written)`;
      if (!form.minQualification.trim()) return 'Minimum qualification is required';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setStep(s => Math.min(s + 1, 6));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setError(null);
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePublish = async () => {
    if (!user) { setError('You must be logged in to post a job'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data: jobData, error: insertError } = await supabase.from('jobs').insert({
        employer_id: user.id,
        title: form.title.trim(),
        category: form.category,
        job_type: form.jobType,
        work_setup: form.workSetup,
        career_level: form.careerLevel,
        region: form.region.trim(),
        min_experience: form.minExperience.trim() || null,
        application_deadline: form.deadline || null,
        salary_min: Number(form.salaryMin) || 0,
        salary_max: Number(form.salaryMax) || 0,
        salary_currency: form.salaryCurrency,
        responsibilities: form.responsibilities.filter(r => r.trim()),
        requirements: form.requirements.filter(r => r.trim()),
        min_qualification: form.minQualification.trim(),
        description: form.description.trim(),
        company_name: form.companyName.trim(),
        company_description: form.companyDescription.trim() || null,
        application_instructions: form.applicationInstructions.trim() || null,
        status: 'active',
      }).select('id').single();
      if (insertError) throw insertError;
      localStorage.removeItem(DRAFT_KEY);
      setSuccess(true);
      setUploadedJobId(jobData.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post job');
    } finally {
      setSaving(false);
    }
  };

  const descWordCount = form.description.trim().split(/\s+/).filter(Boolean).length;

  if (!profile && !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary-600" /> Post a Job
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(p => !p)}
              className="hidden md:flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Hide' : 'Preview'}
            </button>
            <button
              onClick={saveDraft}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {draftSaved ? 'Saved!' : 'Save Draft'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Feedback messages */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 bg-error-muted text-error rounded-xl px-4 py-3 text-sm mb-6">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-success-muted text-success rounded-xl px-4 py-3 text-sm mb-6">
              <CheckCircle className="w-4 h-4 shrink-0" /> Job posted! Redirecting to job board...
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`grid gap-8 ${showPreview ? 'grid-cols-1 xl:grid-cols-5' : 'grid-cols-1 max-w-2xl mx-auto'}`}>
          {/* Form */}
          <div className={showPreview ? 'xl:col-span-3' : ''}>
            <ProgressBar step={step} total={6} />

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* STEP 1: Job Details */}
                {step === 1 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Job Details</h2>
                      <p className="text-sm text-gray-500">Tell candidates the basics about this position</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Job Title <span className="text-error">*</span>
                        <span className="ml-2 text-xs text-gray-400">{form.title.length}/100 chars</span>
                      </label>
                      <input
                        type="text" maxLength={100} value={form.title}
                        onChange={e => update('title', e.target.value)}
                        placeholder="e.g., Digital Marketing Manager"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                      />
                      {form.title.length > 0 && form.title.length < 10 && (
                        <p className="text-xs text-error mt-1">Minimum 10 characters</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                        <select value={form.category} onChange={e => update('category', e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white">
                          {JOB_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          {JOB_TYPES.map(type => (
                            <button key={type} type="button" onClick={() => update('jobType', type)}
                              className={`py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all ${form.jobType === type ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Work Setup</label>
                        <div className="flex gap-2">
                          {WORK_SETUPS.map(setup => (
                            <button key={setup} type="button" onClick={() => update('workSetup', setup)}
                              className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${form.workSetup === setup ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                              {setup}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Career Level</label>
                        <select value={form.careerLevel} onChange={e => update('careerLevel', e.target.value as CareerLevel)}
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white">
                          {CAREER_LEVELS.map(l => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        Region / Location <span className="text-error">*</span>
                      </label>
                      <input type="text" value={form.region} onChange={e => update('region', e.target.value)}
                        placeholder="e.g., Lagos, Nigeria or Remote (Worldwide)"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                    </div>
                  </div>
                )}

                {/* STEP 2: Company Info */}
                {step === 2 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Company Information</h2>
                      <p className="text-sm text-gray-500">Help candidates learn about your company</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Company / Recruiter Name <span className="text-error">*</span>
                      </label>
                      <input type="text" value={form.companyName} onChange={e => update('companyName', e.target.value)}
                        placeholder="e.g., Acme Marketing Inc."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Company Overview
                        <span className="ml-2 text-xs text-gray-400">{form.companyDescription.length}/200 chars</span>
                      </label>
                      <textarea
                        value={form.companyDescription}
                        onChange={e => update('companyDescription', e.target.value)}
                        maxLength={200} rows={3}
                        placeholder="Brief description of your company, mission, and culture (50-200 characters)..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Application Process Instructions (optional)</label>
                      <textarea value={form.applicationInstructions} onChange={e => update('applicationInstructions', e.target.value)}
                        rows={3} placeholder="How should candidates apply? What to expect in your hiring process..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none" />
                    </div>
                  </div>
                )}

                {/* STEP 3: Role Specifics */}
                {step === 3 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Role Specifics</h2>
                      <p className="text-sm text-gray-500">Compensation and experience requirements</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Minimum Experience Required</label>
                      <input type="text" value={form.minExperience} onChange={e => update('minExperience', e.target.value)}
                        placeholder="e.g., 3+ years in digital marketing"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <Calendar className="w-4 h-4 inline mr-1" /> Application Deadline
                      </label>
                      <input type="date" value={form.deadline} onChange={e => update('deadline', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full md:w-auto rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <DollarSign className="w-4 h-4 inline mr-1" /> Salary Range (in {form.salaryCurrency})
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Minimum</label>
                          <input
                            type="number" min="0" step="any" value={form.salaryMin}
                            onChange={e => update('salaryMin', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Maximum</label>
                          <input
                            type="number" min="0" step="any" value={form.salaryMax}
                            onChange={e => update('salaryMax', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Currency</label>
                          <select value={form.salaryCurrency} onChange={e => update('salaryCurrency', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white">
                            {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-primary-600 font-medium mt-2">
                        Preview: {formatSalaryRange(Number(form.salaryMin) || 0, Number(form.salaryMax) || 0, form.salaryCurrency)}
                      </p>
                    </div>
                  </div>
                )}

                {/* STEP 4: Responsibilities & Requirements */}
                {step === 4 && (
                  <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Key Responsibilities</h2>
                      <p className="text-sm text-gray-500 mb-4">Add 5–8 bullet points describing what this role involves</p>
                      <div className="space-y-2">
                        {form.responsibilities.map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-400 w-6 shrink-0">{i + 1}.</span>
                            <input type="text" value={item}
                              onChange={e => updateListItem('responsibilities', i, e.target.value)}
                              placeholder={`Responsibility ${i + 1}`}
                              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                            {form.responsibilities.length > 5 && (
                              <button onClick={() => removeListItem('responsibilities', i)} className="text-gray-400 hover:text-error p-1 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {form.responsibilities.length < 8 && (
                        <button onClick={() => addListItem('responsibilities')}
                          className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
                          <Plus className="w-4 h-4" /> Add responsibility
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {form.responsibilities.filter(r => r.trim()).length} of 5–8 added
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Requirements & Skills</h2>
                      <p className="text-sm text-gray-500 mb-4">List the key qualifications and skills you require</p>
                      <div className="space-y-2">
                        {form.requirements.map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-400 w-6 shrink-0">•</span>
                            <input type="text" value={item}
                              onChange={e => updateListItem('requirements', i, e.target.value)}
                              placeholder={`Skill or requirement ${i + 1}`}
                              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                            {form.requirements.length > 1 && (
                              <button onClick={() => removeListItem('requirements', i)} className="text-gray-400 hover:text-error p-1 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => addListItem('requirements')}
                        className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
                        <Plus className="w-4 h-4" /> Add requirement
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 5: Description */}
                {step === 5 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Job Description</h2>
                      <p className="text-sm text-gray-500">A compelling description attracts more qualified applicants</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Minimum Qualification <span className="text-error">*</span>
                      </label>
                      <input type="text" value={form.minQualification}
                        onChange={e => update('minQualification', e.target.value)}
                        placeholder="e.g., Bachelor's degree in Marketing or related field"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Detailed Job Description <span className="text-error">*</span>
                        <span className="ml-2 text-xs text-gray-400">(150–300 words)</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-2 italic">
                        Describe the role overview, team structure, reporting lines, growth opportunities, company culture, benefits, and application process.
                      </p>
                      <textarea value={form.description}
                        onChange={e => update('description', e.target.value)}
                        rows={10}
                        placeholder="Write a compelling description that gives candidates a real sense of the role, team, and opportunity..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none" />
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <AIGenerateButton type="rewrite" content={form.description} label="Improve Job Description" onApply={(v) => update('description', v)} />
                        <AIGenerateButton type="summary" content={form.description} label="Summarize Role" onApply={(v) => update('description', v)} />
                      </div>
                      <div className={`flex items-center justify-between text-xs mt-1 ${
                        descWordCount < 150 || descWordCount > 300 ? 'text-error' : 'text-success'
                      }`}>
                        <span>
                          {descWordCount} words
                          {descWordCount < 150 ? ` — need ${150 - descWordCount} more` : descWordCount > 300 ? ` — ${descWordCount - 300} over limit` : ' ✓ Good length'}
                        </span>
                        <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${descWordCount < 150 ? 'bg-error' : descWordCount > 300 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${Math.min(100, (descWordCount / 300) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 6: Preview & Publish */}
                {step === 6 && (
                  <div className="space-y-5">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Review Your Job Ad</h2>
                      <p className="text-sm text-gray-500 mb-4">This is how your job will appear to candidates. Ready to publish?</p>
                      <JobPreview form={form} />
                    </div>

                    {/* Edit buttons for each step */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Edit sections</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {STEPS.slice(0, 5).map(s => (
                          <button key={s.id} onClick={() => setStep(s.id)}
                            className="flex items-center gap-2 text-sm text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl px-3 py-2 transition-colors">
                            <s.icon className="w-4 h-4" />
                            {s.title}
                            <ChevronRight className="w-3 h-3 ml-auto" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handlePublish}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-2xl py-4 transition-colors disabled:opacity-50 text-base shadow-lg shadow-primary-200"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                      {saving ? 'Publishing...' : 'Publish Job Ad'}
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Nav Buttons */}
            {step < 6 && (
              <div className="flex items-center justify-between mt-6">
                <button onClick={goBack} disabled={step === 1}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={goNext}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-6 py-2.5 transition-colors">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
            {step === 6 && (
              <div className="flex mt-4">
                <button onClick={goBack} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            )}
          </div>

          {/* Live Preview Panel (desktop) */}
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="xl:col-span-2 hidden xl:block"
            >
              <div className="sticky top-24">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4 text-primary-600" />
                  <p className="text-sm font-semibold text-gray-700">Live Preview</p>
                  <span className="text-xs text-gray-400 ml-auto">Updates as you type</span>
                </div>
                <JobPreview form={form} />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <PostUploadConfirmation
        uploadType="JOB"
        itemId={uploadedJobId || ''}
        visible={!!uploadedJobId}
        onDismiss={() => setUploadedJobId(null)}
      />
    </div>
  );
}
