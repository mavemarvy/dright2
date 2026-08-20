import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, DollarSign, CheckCircle2, Clock, XCircle,
  Loader2, Plus, TrendingUp,
} from 'lucide-react';
import { useCampaigns, useSubmissions, useReviewSubmission } from '../lib/campaignHooks';
import { useAuth } from '../contexts/AuthContext';

export default function CreatorDashboardPage() {
  const { user } = useAuth();
  const { campaigns } = useCampaigns({ creatorId: user?.id });
  const [reviewCampaignId, setReviewCampaignId] = useState<string | null>(null);
  const { submissions, refetch } = useSubmissions({ campaignId: reviewCampaignId || undefined, status: 'pending' });
  const { review, reviewing } = useReviewSubmission();

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.escrow_amount), 0);
  const totalApproved = campaigns.reduce((s, c) => s + c.completed_count, 0);
  const totalPending = campaigns.reduce((s, c) => s + c.pending_count, 0);

  const handleReview = async (submissionId: string, verdict: 'approved' | 'rejected' | 'revision_requested') => {
    await review(submissionId, verdict, verdict === 'approved' ? 'Approved' : verdict === 'rejected' ? 'Does not meet requirements' : 'Please revise');
    await refetch();
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Creator Dashboard</h1>
        <Link to="/creator-campaigns/create" className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 flex items-center gap-1">
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="Active Campaigns" value={String(activeCampaigns.length)} color="from-blue-400 to-blue-600" />
        <StatCard icon={DollarSign} label="In Escrow" value={`$${totalSpent.toFixed(2)}`} color="from-amber-400 to-amber-600" />
        <StatCard icon={CheckCircle2} label="Approved" value={String(totalApproved)} color="from-green-400 to-green-600" />
        <StatCard icon={Clock} label="Pending Review" value={String(totalPending)} color="from-purple-400 to-purple-600" />
      </div>

      {/* My Campaigns */}
      <h2 className="font-bold text-gray-900 mb-3">My Campaigns</h2>
      {campaigns.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No campaigns yet</p>
          <Link to="/creator-campaigns/create" className="mt-3 inline-block px-4 py-2 bg-primary-600 text-white rounded-xl text-sm">Create Your First Campaign</Link>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/creator-campaigns/${c.id}`} className="font-bold text-gray-900 hover:text-primary-600 truncate">{c.name}</Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${c.status === 'active' ? 'bg-green-50 text-green-600' : c.status === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="text-green-600 font-medium">${Number(c.reward_per_completion).toFixed(2)}</span>
                    <span>{c.workers_count}{c.max_workers ? `/${c.max_workers}` : ''} workers</span>
                    <span>{c.completed_count} approved</span>
                    <span className={c.pending_count > 0 ? 'text-amber-600 font-medium' : ''}>{c.pending_count} pending</span>
                  </div>
                </div>
                {c.pending_count > 0 && (
                  <button
                    onClick={() => setReviewCampaignId(reviewCampaignId === c.id ? null : c.id)}
                    className="px-3 py-1.5 bg-primary-50 text-primary-600 rounded-xl text-xs font-medium hover:bg-primary-100"
                  >
                    {reviewCampaignId === c.id ? 'Hide' : 'Review'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submissions Review */}
      {reviewCampaignId && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Pending Submissions</h2>
          {submissions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No pending submissions</p>
          ) : (
            <div className="space-y-3">
              {submissions.map(s => (
                <div key={s.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.worker?.full_name || 'Worker'}</p>
                      <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                    {s.ai_score !== null && (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${Number(s.ai_score) >= 80 ? 'bg-green-50 text-green-600' : Number(s.ai_score) >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                        AI: {Number(s.ai_score).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {s.evidence_text && <p className="text-sm text-gray-600 mb-2">{s.evidence_text}</p>}
                  {s.evidence_links && s.evidence_links.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {s.evidence_links.map((link, i) => <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">Link {i + 1}</a>)}
                    </div>
                  )}
                  {s.evidence_urls && s.evidence_urls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {s.evidence_urls.map((url, i) => <img key={i} src={url} alt={`Evidence ${i + 1}`} className="w-16 h-16 object-cover rounded-lg" />)}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button onClick={() => handleReview(s.id, 'approved')} disabled={reviewing} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                      {reviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button onClick={() => handleReview(s.id, 'rejected')} disabled={reviewing} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button onClick={() => handleReview(s.id, 'revision_requested')} disabled={reviewing} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-50">
                      Request Revision
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
