import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, DollarSign, Clock, Users, Bookmark, Flag,
  CheckCircle2, AlertCircle, Loader2, Upload, Link as LinkIcon,
  FileText, Send,
} from 'lucide-react';
import { useCampaign, useBookmarks, useSubmitTask, useWorkerProfile } from '../lib/campaignHooks';
import { useAuth } from '../contexts/AuthContext';
import { LEVEL_ICONS, type WorkerLevel } from '../lib/campaignTypes';
import { uploadCampaignFile } from '../lib/campaignLib';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { campaign, media, loading } = useCampaign(id);
  const { user } = useAuth();
  const { isBookmarked, toggle } = useBookmarks();
  const { submit, submitting, error: submitError } = useSubmitTask();
  const { profile: workerProfile } = useWorkerProfile();
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceLinks, setEvidenceLinks] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  if (loading) {
    return <div className="p-6 max-w-4xl mx-auto"><div className="bg-gray-100 rounded-2xl h-96 animate-pulse" /></div>;
  }

  if (!campaign) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Campaign not found</p>
        <Link to="/creator-campaigns" className="mt-4 inline-block px-4 py-2 bg-primary-600 text-white rounded-xl text-sm">Back to Campaigns</Link>
      </div>
    );
  }

  const isCreator = user?.id === campaign.creator_id;
  const meetsLevelReq = workerProfile ? meetsLevel(workerProfile.level as WorkerLevel, campaign.minimum_user_level as WorkerLevel) : true;
  const reward = Number(campaign.reward_per_completion);
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at) : null;
  const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadCampaignFile(user.id, file);
        urls.push(url);
      }
      setUploadedFiles(prev => [...prev, ...urls]);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!id) return;
    try {
      await submit(id, {
        evidence_urls: uploadedFiles,
        evidence_text: evidenceText,
        evidence_links: evidenceLinks.split('\n').filter(l => l.trim()),
        notes: '',
      });
      setSubmitResult('Task submitted successfully! The creator will review your submission.');
      setShowSubmitForm(false);
      setEvidenceText('');
      setEvidenceLinks('');
      setUploadedFiles([]);
    } catch { /* */ }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Link to="/creator-campaigns" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Campaigns
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        {media.length > 0 && media[0].file_type === 'image' && (
          <img src={media[0].file_url} alt={campaign.name} className="w-full h-48 object-cover" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary-50 text-primary-700 capitalize">{campaign.task_type.replace(/_/g, ' ')}</span>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">{campaign.difficulty}</span>
                {campaign.is_featured && <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-600">Featured</span>}
              </div>
              <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
              {campaign.creator && (
                <p className="text-sm text-gray-500 mt-1">by {campaign.creator.full_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isCreator && (
                <button onClick={() => toggle(campaign.id)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                  <Bookmark className={`w-5 h-5 ${isBookmarked(campaign.id) ? 'fill-primary-600 text-primary-600' : 'text-gray-400'}`} />
                </button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatBox icon={DollarSign} label="Reward" value={`$${reward.toFixed(2)}`} color="text-green-600" />
            <StatBox icon={Users} label="Workers" value={`${campaign.workers_count}${campaign.max_workers ? `/${campaign.max_workers}` : ''}`} color="text-blue-600" />
            <StatBox icon={Clock} label="Est. Time" value={campaign.estimated_completion_time || '—'} color="text-purple-600" />
            <StatBox icon={Flag} label="Ends In" value={daysLeft !== null ? (daysLeft >= 0 ? `${daysLeft}d` : 'Ended') : 'No limit'} color={daysLeft !== null && daysLeft <= 3 ? 'text-red-500' : 'text-gray-600'} />
          </div>
        </div>
      </div>

      {/* Description & Instructions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-2">About this campaign</h2>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{campaign.description || 'No description provided.'}</p>

        {campaign.instructions && (
          <>
            <h3 className="font-bold text-gray-900 mt-4 mb-2">Instructions</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{campaign.instructions}</p>
          </>
        )}

        {campaign.tags && campaign.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {campaign.tags.map(tag => <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">#{tag}</span>)}
          </div>
        )}
      </div>

      {/* Evidence Requirements */}
      {campaign.evidence_types && campaign.evidence_types.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h2 className="font-bold text-gray-900 mb-2">Required Evidence</h2>
          <div className="flex flex-wrap gap-2">
            {campaign.evidence_types.map(et => (
              <span key={et} className="text-xs font-medium px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 capitalize">{et.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      )}

      {/* Media Gallery */}
      {media.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h2 className="font-bold text-gray-900 mb-3">Reference Files</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {media.map(m => (
              <div key={m.id} className="relative">
                {m.file_type === 'image' ? (
                  <img src={m.file_url} alt={m.file_name || ''} className="w-full h-32 object-cover rounded-xl" />
                ) : (
                  <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100">
                    <FileText className="w-5 h-5 text-gray-400" /> {m.file_name || 'File'}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Form */}
      {submitResult ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-medium text-green-800">{submitResult}</p>
          <Link to="/creator-campaigns/my-tasks" className="mt-3 inline-block px-4 py-2 bg-green-600 text-white rounded-xl text-sm">View My Tasks</Link>
        </div>
      ) : isCreator ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
          <p className="text-sm text-amber-700">This is your campaign. You can review submissions from your Creator Dashboard.</p>
          <Link to="/creator-campaigns/dashboard" className="mt-3 inline-block px-4 py-2 bg-amber-600 text-white rounded-xl text-sm">Go to Dashboard</Link>
        </div>
      ) : !meetsLevelReq ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">You need {LEVEL_ICONS[campaign.minimum_user_level as WorkerLevel]} {campaign.minimum_user_level} level or higher to participate.</p>
        </div>
      ) : showSubmitForm ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Submit Your Work</h2>

          {/* File Upload */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Upload Evidence Files</label>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-primary-300 transition-colors">
              {uploading ? <Loader2 className="w-6 h-6 text-primary-500 animate-spin" /> : <Upload className="w-6 h-6 text-gray-400" />}
              <span className="text-sm text-gray-500 mt-1">{uploading ? 'Uploading...' : 'Click to upload screenshots, videos, or files'}</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/*,video/*,.pdf,.zip,.mp3,.wav" />
            </label>
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {uploadedFiles.map((_, i) => <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> File {i + 1}</span>)}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-1"><LinkIcon className="w-4 h-4" /> Evidence Links (one per line)</label>
            <textarea value={evidenceLinks} onChange={e => setEvidenceLinks(e.target.value)} rows={3} placeholder="https://example.com/your-review&#10;https://tiktok.com/@your/video" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>

          {/* Text */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Additional Notes</label>
            <textarea value={evidenceText} onChange={e => setEvidenceText(e.target.value)} rows={3} placeholder="Describe what you did, any issues, or context for the reviewer..." className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>

          {submitError && <p className="text-sm text-red-500 mb-3">{submitError}</p>}

          <div className="flex items-center gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-1">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit Task
            </button>
            <button onClick={() => setShowSubmitForm(false)} className="px-4 py-2.5 text-gray-500 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowSubmitForm(true)} className="w-full py-3.5 bg-primary-600 text-white rounded-2xl font-bold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2">
          <Send className="w-5 h-5" /> Start Task & Submit
        </button>
      )}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <Icon className={`w-4 h-4 ${color} mb-1`} />
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function meetsLevel(userLevel: WorkerLevel, requiredLevel: WorkerLevel): boolean {
  const order: WorkerLevel[] = ['bronze', 'silver', 'gold', 'diamond', 'elite', 'legend'];
  return order.indexOf(userLevel) >= order.indexOf(requiredLevel);
}
