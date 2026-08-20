import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Briefcase, MapPin, Calendar, DollarSign, Clock,
  Building2, CheckCircle, AlertCircle, Loader2, Send,
  Users, FileText, GraduationCap, ListChecks, Store, MessageCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatSalaryRange } from '../lib/currency';
import SeoHead from '../components/SeoHead';
import NapFooter from '../components/NapFooter';
import { startOrFindConversation } from '../lib/chatHooks';
import type { Job, JobApplication } from '../lib/types';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Application form state
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [applying, setApplying] = useState(false);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [applicationSuccess, setApplicationSuccess] = useState(false);
  const [existingApplication, setExistingApplication] = useState<JobApplication | null>(null);
  const [contactingEmployer, setContactingEmployer] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchJob();
  }, [id]);

  useEffect(() => {
    if (user && id) {
      checkExistingApplication();
    }
  }, [user, id]);

  const fetchJob = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select(`
        *,
        employer:users!jobs_employer_id_fkey(full_name, avatar_url, store_title)
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !data) {
      setError('Job not found');
      setLoading(false);
      return;
    }

    const jobData = data as Job & { employer: { full_name: string; avatar_url: string | null; store_title: string | null } };
    setJob({
      ...jobData,
      employer_name: jobData.employer?.full_name,
      employer_avatar: jobData.employer?.avatar_url,
      employer_store_title: jobData.employer?.store_title,
    });
    setLoading(false);
  };

  const checkExistingApplication = async () => {
    if (!user || !id) return;
    const { data } = await supabase
      .from('job_applications')
      .select('*')
      .eq('job_id', id)
      .eq('applicant_id', user.id)
      .maybeSingle();

    if (data) setExistingApplication(data as JobApplication);
  };

  const handleApply = async () => {
    if (!user || !job) return;

    setApplicationError(null);

    if (!email.trim()) {
      setApplicationError('Email is required');
      return;
    }
    if (!coverLetter.trim() || coverLetter.trim().length < 50) {
      setApplicationError('Cover letter must be at least 50 characters');
      return;
    }

    setApplying(true);

    try {
      const { error: insertError } = await supabase.from('job_applications').insert({
        job_id: job.id,
        applicant_id: user.id,
        cover_letter: coverLetter.trim(),
        applicant_location: profile?.location || null,
        applicant_phone: phone.trim() || null,
        applicant_email: email.trim(),
        status: 'pending',
      });

      if (insertError) {
        if (insertError.code === '23505') {
          setApplicationError('You have already applied for this job');
        } else {
          throw insertError;
        }
      } else {
        setApplicationSuccess(true);
        setShowApplyForm(false);
        checkExistingApplication();
      }
    } catch (err) {
      setApplicationError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">{error || 'Job not found'}</p>
        <Link to="/market?category=jobs" className="text-primary-600 hover:underline">Back to marketplace</Link>
      </div>
    );
  }

  const isOwner = user?.id === job.employer_id;
  const deadlinePassed = job.application_deadline && new Date(job.application_deadline) < new Date();
  const canApply = !isOwner && !deadlinePassed && !existingApplication;

  return (
    <div className="min-h-screen bg-gray-50">
      <SeoHead
        title={job.title}
        description={`${job.title} at ${job.company_name} — ${job.job_type ?? ""}, ${job.work_setup ?? ""}, ${job.region ?? ""}. Apply for free on Dright.`}
        canonical={`/jobs/${job.id}`}
        keywords={[job.title, job.category ?? "", job.job_type ?? "", job.work_setup ?? "", job.region ?? "", 'job application', 'careers']}
        breadcrumbs={[
          { name: 'Home', url: '/welcome' },
          { name: 'Marketplace', url: '/market' },
          { name: 'Jobs', url: '/market?category=jobs' },
          { name: job.title },
        ]}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Job Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-primary-700 bg-primary-50 rounded-full px-3 py-1">{job.category}</span>
                <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-3 py-1">{job.job_type}</span>
                <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-3 py-1">{job.work_setup}</span>
                <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-3 py-1">{job.career_level}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> {job.company_name}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {(job.region ?? "")}
                </span>
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" /> {formatSalaryRange(((job.salary_min ?? 0) ?? 0), (job.salary_max ?? 0) ?? undefined, job.salary_currency)}
                </span>
                {job.application_deadline && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" /> Deadline: {new Date(job.application_deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {!isOwner && job.employer_id && (
              <div className="shrink-0 flex gap-2">
                <button
                  onClick={async () => {
                    if (!user) { navigate('/sign-in'); return; }
                    setContactingEmployer(true);
                    try {
                      const convId = await startOrFindConversation({
                        currentUserId: user.id,
                        otherUserId: job.employer_id,
                        contextType: 'job_application',
                        contextId: job.id,
                        contextData: {
                          title: job.title,
                          company_name: job.company_name,
                          salary: formatSalaryRange(((job.salary_min ?? 0) ?? 0), (job.salary_max ?? 0) ?? undefined, job.salary_currency),
                          location: (job.region ?? ""),
                        },
                      });
                      if (convId) navigate(`/chat?conv=${convId}`);
                    } finally {
                      setContactingEmployer(false);
                    }
                  }}
                  disabled={contactingEmployer}
                  className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl px-4 py-3 transition-colors text-sm disabled:opacity-60"
                >
                  {contactingEmployer ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  Chat Employer
                </button>
                <div className="shrink-0">
                {existingApplication ? (
                  <div className="flex items-center gap-2 bg-success-muted text-success rounded-xl px-4 py-3 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> Applied
                  </div>
                ) : applicationSuccess ? (
                  <div className="flex items-center gap-2 bg-success-muted text-success rounded-xl px-4 py-3 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> Application sent!
                  </div>
                ) : canApply ? (
                  <button
                    onClick={() => {
                      if (!user) {
                        navigate('/signin');
                        return;
                      }
                      setEmail(profile?.email || user?.email || '');
                      setPhone(profile?.phone || '');
                      setShowApplyForm(true);
                    }}
                    className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-6 py-3 transition-colors"
                  >
                    <Send className="w-4 h-4" /> Apply for Free
                  </button>
                ) : deadlinePassed ? (
                  <div className="flex items-center gap-2 bg-gray-100 text-gray-500 rounded-xl px-4 py-3 text-sm font-medium">
                    <Clock className="w-4 h-4" /> Deadline passed
                  </div>
                ) : null}
                </div>
              </div>
            )}

            {isOwner && (
              <div className="shrink-0 flex items-center gap-2 bg-primary-50 text-primary-700 rounded-xl px-4 py-3 text-sm font-medium">
                <Users className="w-4 h-4" /> Your posting
              </div>
            )}
          </div>

          {/* Location match suggestion */}
          {profile?.location && (job.region ?? "") && !isOwner && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {(job.region ?? "").toLowerCase().includes(profile.location.toLowerCase().split(',')[0]?.toLowerCase() || '___') ? (
                  <span className="text-success flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> This job matches your location ({profile.location})
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Job location: {(job.region ?? "")} · Your location: {profile.location}
                  </span>
                )}
              </p>
            </div>
          )}
        </motion.div>

        {/* Application Form */}
        {showApplyForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 p-6 mb-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Apply for this position</h2>
            <p className="text-sm text-gray-500 mb-4">Application is completely free. Make sure your profile is complete.</p>

            {applicationError && (
              <div className="flex items-center gap-2 bg-error-muted text-error rounded-xl px-4 py-3 text-sm mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" /> {applicationError}
              </div>
            )}

            {/* Profile completion reminder */}
            {profile && !profile.location && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Add your location in <Link to="/profile" className="underline font-medium">profile settings</Link> to improve your chances.</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-error">*</span></label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Cover Letter <span className="text-error">*</span>
                  <span className="text-xs text-gray-400 ml-2">(minimum 50 characters)</span>
                </label>
                <textarea
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  rows={6}
                  placeholder="Tell the employer why you're the perfect fit for this role..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{coverLetter.trim().length} characters</p>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowApplyForm(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-5 py-2.5 transition-colors disabled:opacity-50"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Job Description */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" /> Job Description
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.description}</p>
            </section>

            {/* Key Responsibilities */}
            {((job.responsibilities || []) || []).length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-primary-600" /> Key Responsibilities
                </h2>
                <ul className="space-y-2">
                  {(job.responsibilities || []).map((resp, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Requirements */}
            {job.requirements && (Array.isArray(job.requirements) ? job.requirements.length > 0 : job.requirements.length > 0) && (
              <section className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements & Skills</h2>
                <ul className="space-y-2">
                  {(Array.isArray(job.requirements) ? job.requirements as string[] : (job.requirements ? [job.requirements] : [])).map((req: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-primary-600 font-bold mt-0.5">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Qualifications */}
            {job.min_qualification && (
              <section className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary-600" /> Minimum Qualification
                </h2>
                <p className="text-sm text-gray-700">{job.min_qualification}</p>
              </section>
            )}

            {/* Application Instructions */}
            {job.application_instructions && (
              <section className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Application Process</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.application_instructions}</p>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Company Info */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary-600" /> About the Company
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400">Company</p>
                  <p className="text-sm font-medium text-gray-900">{job.company_name}</p>
                </div>
                {job.company_description && (
                  <p className="text-sm text-gray-600">{job.company_description}</p>
                )}
                {job.employer_name && (
                  <div>
                    <p className="text-xs text-gray-400">Posted by</p>
                    <p className="text-sm font-medium text-gray-900">{job.employer_name}</p>
                  </div>
                )}
                <Link
                  to={`/shop/${job.employer_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  <Store className="w-4 h-4" />
                  Visit Store
                </Link>
              </div>
            </section>

            {/* Job Summary */}
            <section className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-primary-600" /> Job Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Job Type</span>
                  <span className="font-medium text-gray-900">{job.job_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Work Setup</span>
                  <span className="font-medium text-gray-900">{job.work_setup}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Career Level</span>
                  <span className="font-medium text-gray-900">{job.career_level}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Location</span>
                  <span className="font-medium text-gray-900">{(job.region ?? "")}</span>
                </div>
                {job.min_experience && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Experience</span>
                    <span className="font-medium text-gray-900">{job.min_experience}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Salary</span>
                  <span className="font-medium text-gray-900">{formatSalaryRange(((job.salary_min ?? 0) ?? 0), (job.salary_max ?? 0) ?? undefined, job.salary_currency)}</span>
                </div>
                {job.application_deadline && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Deadline</span>
                    <span className={`font-medium ${deadlinePassed ? 'text-error' : 'text-gray-900'}`}>
                      {new Date(job.application_deadline).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-gray-500">Posted</span>
                  <span className="font-medium text-gray-900">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <NapFooter />
    </div>
  );
}
