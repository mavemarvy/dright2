import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronRight, ChevronLeft, Loader2, Plus, X,
  Upload, DollarSign, Rocket, FileText,
} from 'lucide-react';
import { useCategories } from '../lib/campaignHooks';
import { useAuth } from '../contexts/AuthContext';
import { createCampaign, uploadCampaignFile, getOrCreateWallet, depositFunds } from '../lib/campaignLib';
import { TASK_TYPES, EVIDENCE_TYPES, REWARD_PRESETS, MAX_WORKER_PRESETS, type CampaignRequirement } from '../lib/campaignTypes';

const STEPS = ['Details', 'Media', 'Requirements', 'Rewards', 'Verification', 'Launch'];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
];

export default function CampaignBuilderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories } = useCategories();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [taskType, setTaskType] = useState('custom_campaign');
  const [difficulty, setDifficulty] = useState('easy');
  const [estTime, setEstTime] = useState('');
  const [language, setLanguage] = useState('en');
  const [countries, setCountries] = useState('');
  const [minLevel, setMinLevel] = useState('bronze');
  const [tags, setTags] = useState('');
  const [reward, setReward] = useState(1);
  const [maxWorkers, setMaxWorkers] = useState(100);
  const [verificationType, setVerificationType] = useState<'manual' | 'automatic' | 'hybrid'>('manual');
  const [evidenceTypes, setEvidenceTypes] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<CampaignRequirement[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<{ url: string; type: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const platformFee = 10;
  const totalBudget = reward * maxWorkers;
  const feeAmount = (totalBudget * platformFee) / 100;
  const totalDeposit = totalBudget + feeAmount;

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadCampaignFile(user.id, file);
        setUploadedMedia(prev => [...prev, { url, type: file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file', name: file.name }]);
      }
    } catch (err) { console.error('Upload failed:', err); }
    finally { setUploading(false); }
  };

  const addRequirement = () => {
    setRequirements(prev => [...prev, { id: crypto.randomUUID(), label: '', type: 'text', required: true, placeholder: '' }]);
  };

  const updateRequirement = (id: string, patch: Partial<CampaignRequirement>) => {
    setRequirements(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRequirement = (id: string) => {
    setRequirements(prev => prev.filter(r => r.id !== id));
  };

  const toggleEvidence = (et: string) => {
    setEvidenceTypes(prev => prev.includes(et) ? prev.filter(e => e !== et) : [...prev, et]);
  };

  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return true;
    if (step === 2) return true;
    if (step === 3) return reward > 0 && maxWorkers > 0;
    if (step === 4) return evidenceTypes.length > 0;
    if (step === 5) return agreedToTerms;
    return true;
  };

  const handleLaunch = async () => {
    if (!user) return;
    setCreating(true);
    setError(null);
    try {
      // Create campaign
      const campaign = await createCampaign({
        creator_id: user.id,
        category_id: categoryId || null,
        name,
        description,
        instructions,
        task_type: taskType,
        difficulty: difficulty as 'easy' | 'medium' | 'hard' | 'expert',
        estimated_completion_time: estTime,
        language,
        countries_allowed: countries.split(',').map(c => c.trim()).filter(Boolean),
        minimum_user_level: minLevel,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        reward_per_completion: reward,
        max_workers: maxWorkers,
        total_budget: totalBudget,
        escrow_amount: totalBudget,
        platform_fee_percent: platformFee,
        verification_type: verificationType,
        evidence_types: evidenceTypes,
        requirements: requirements as unknown as CampaignRequirement[],
        status: 'active',
        launched_at: new Date().toISOString(),
      });

      // Upload media records
      for (let i = 0; i < uploadedMedia.length; i++) {
        const m = uploadedMedia[i];
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/cc_media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ campaign_id: campaign.id, file_url: m.url, file_type: m.type, file_name: m.name, position: i }),
        });
      }

      // Fund escrow: ensure wallet exists and deposit the budget
      await getOrCreateWallet(user.id);
      await depositFunds(user.id, totalDeposit);

      navigate(`/creator-campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally { setCreating(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Create Campaign</h1>

      {/* Step Progress */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${i === step ? 'bg-primary-600 text-white' : i < step ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {i < step ? <Check className="w-3 h-3" /> : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
              {s}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Campaign Name" required>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Review our new mobile app on the App Store" className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe what workers will do and what you're looking for..." className={inputClass} />
            </Field>
            <Field label="Instructions">
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} placeholder="Step-by-step instructions for workers..." className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputClass}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Task Type">
                <select value={taskType} onChange={e => setTaskType(e.target.value)} className={inputClass}>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Difficulty">
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className={inputClass}>
                  {DIFFICULTY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </Field>
              <Field label="Est. Completion Time">
                <input value={estTime} onChange={e => setEstTime(e.target.value)} placeholder="e.g. 5 minutes" className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Language">
                <input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en" className={inputClass} />
              </Field>
              <Field label="Min. Worker Level">
                <select value={minLevel} onChange={e => setMinLevel(e.target.value)} className={inputClass}>
                  {['bronze', 'silver', 'gold', 'diamond', 'elite', 'legend'].map(l => <option key={l} value={l} className="capitalize">{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Countries Allowed (comma-separated)">
              <input value={countries} onChange={e => setCountries(e.target.value)} placeholder="US, UK, CA (blank = all)" className={inputClass} />
            </Field>
            <Field label="Tags (comma-separated)">
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="android, review, app" className={inputClass} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Upload images, videos, PDFs, or reference files for your campaign.</p>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-primary-300 transition-colors">
              {uploading ? <Loader2 className="w-6 h-6 text-primary-500 animate-spin" /> : <Upload className="w-6 h-6 text-gray-400" />}
              <span className="text-sm text-gray-500 mt-1">{uploading ? 'Uploading...' : 'Click to upload files'}</span>
              <input type="file" multiple className="hidden" onChange={handleMediaUpload} accept="image/*,video/*,.pdf,.zip,.mp3,.wav" />
            </label>
            {uploadedMedia.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {uploadedMedia.map((m, i) => (
                  <div key={i} className="relative group">
                    {m.type === 'image' ? <img src={m.url} alt="" className="w-full h-20 object-cover rounded-lg" /> : <div className="w-full h-20 bg-gray-100 rounded-lg flex items-center justify-center"><FileText className="w-6 h-6 text-gray-400" /></div>}
                    <button onClick={() => setUploadedMedia(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Define exactly what workers must do. Add custom fields for evidence collection.</p>
            {requirements.map(r => (
              <div key={r.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={r.label} onChange={e => updateRequirement(r.id, { label: e.target.value })} placeholder="Requirement label (e.g. 'Paste your review URL')" className={inputClass} />
                  <button onClick={() => removeRequirement(r.id)} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <select value={r.type} onChange={e => updateRequirement(r.id, { type: e.target.value as CampaignRequirement['type'] })} className={inputClass}>
                    <option value="text">Text Input</option>
                    <option value="url">URL Link</option>
                    <option value="file">File Upload</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="video">Video</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    <input type="checkbox" checked={r.required} onChange={e => updateRequirement(r.id, { required: e.target.checked })} /> Required
                  </label>
                </div>
                <input value={r.placeholder || ''} onChange={e => updateRequirement(r.id, { placeholder: e.target.value })} placeholder="Placeholder text (optional)" className={inputClass} />
              </div>
            ))}
            <button onClick={addRequirement} className="flex items-center gap-1 text-sm text-primary-600 font-medium hover:text-primary-700"><Plus className="w-4 h-4" /> Add Requirement</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Field label="Reward Per Completion">
              <div className="flex flex-wrap gap-2 mb-2">
                {REWARD_PRESETS.map(r => <button key={r} onClick={() => setReward(r)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${reward === r ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>${r}</button>)}
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <input type="number" value={reward} onChange={e => setReward(parseFloat(e.target.value) || 0)} step="0.25" min="0.25" className={inputClass} />
              </div>
            </Field>
            <Field label="Maximum Workers">
              <div className="flex flex-wrap gap-2 mb-2">
                {MAX_WORKER_PRESETS.map(w => <button key={w} onClick={() => setMaxWorkers(w)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${maxWorkers === w ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{w}</button>)}
                <button onClick={() => setMaxWorkers(999999)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${maxWorkers === 999999 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Unlimited</button>
              </div>
              <input type="number" value={maxWorkers} onChange={e => setMaxWorkers(parseInt(e.target.value) || 0)} className={inputClass} />
            </Field>

            {/* Budget Calculator */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Reward per user</span><span className="font-medium text-gray-900">${reward.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Max workers</span><span className="font-medium text-gray-900">{maxWorkers === 999999 ? 'Unlimited' : maxWorkers}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Campaign budget</span><span className="font-medium text-gray-900">${totalBudget.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Platform fee ({platformFee}%)</span><span className="font-medium text-gray-900">${feeAmount.toFixed(2)}</span></div>
              <div className="flex justify-between text-base pt-2 border-t border-gray-200"><span className="font-bold text-gray-900">Total deposit required</span><span className="font-bold text-primary-600">${totalDeposit.toFixed(2)}</span></div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <Field label="Verification Type">
              <div className="grid grid-cols-3 gap-2">
                {(['manual', 'automatic', 'hybrid'] as const).map(v => (
                  <button key={v} onClick={() => setVerificationType(v)} className={`px-3 py-2.5 rounded-xl text-sm font-medium capitalize ${verificationType === v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{v}</button>
                ))}
              </div>
            </Field>
            <Field label="Evidence Types">
              <div className="flex flex-wrap gap-2">
                {EVIDENCE_TYPES.map(et => (
                  <button key={et} onClick={() => toggleEvidence(et)} className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize ${evidenceTypes.includes(et) ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{et.replace(/_/g, ' ')}</button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-gray-900 mb-2">Review Your Campaign</h3>
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Category" value={categories.find(c => c.id === categoryId)?.name || '—'} />
              <ReviewRow label="Task Type" value={taskType.replace(/_/g, ' ')} />
              <ReviewRow label="Difficulty" value={difficulty} />
              <ReviewRow label="Reward" value={`$${reward.toFixed(2)}`} />
              <ReviewRow label="Max Workers" value={maxWorkers === 999999 ? 'Unlimited' : String(maxWorkers)} />
              <ReviewRow label="Total Budget" value={`$${totalBudget.toFixed(2)}`} />
              <ReviewRow label="Total Deposit" value={`$${totalDeposit.toFixed(2)}`} />
              <ReviewRow label="Verification" value={verificationType} />
              <ReviewRow label="Evidence" value={evidenceTypes.join(', ').replace(/_/g, ' ') || '—'} />
              <ReviewRow label="Media" value={`${uploadedMedia.length} files`} />
              <ReviewRow label="Requirements" value={`${requirements.length} custom`} />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} className="mt-1" />
              I agree to the campaign terms. Funds will be held in escrow and released only when I approve submissions. I understand the platform fee is non-refundable.
            </label>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : navigate('/creator-campaigns')}
          className="px-4 py-2.5 text-gray-500 text-sm font-medium hover:text-gray-700 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canProceed() && setStep(step + 1)}
            disabled={!canProceed()}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={!canProceed() || creating}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Launch Campaign
          </button>
        )}
      </div>
    </div>
  );
}

const inputClass = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1.5 block">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-900 capitalize">{value}</span></div>;
}
