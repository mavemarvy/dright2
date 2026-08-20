import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, Sparkles } from 'lucide-react';
import { useSubmissions } from '../lib/campaignHooks';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { key: 'completed', label: 'Completed', icon: CheckCircle2, status: 'approved' },
  { key: 'pending', label: 'Pending Review', icon: Clock, status: 'pending' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, status: 'rejected' },
];

export default function MyTasksPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'completed' | 'pending' | 'rejected'>('pending');
  const status = TABS.find(t => t.key === tab)?.status;
  const { submissions, loading } = useSubmissions({ workerId: user?.id, status });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">My Tasks</h1>

      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'completed' | 'pending' | 'rejected')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No {tab} tasks yet</p>
          <Link to="/creator-campaigns" className="mt-4 inline-block px-4 py-2 bg-primary-600 text-white rounded-xl text-sm">Find Campaigns</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(s => (
            <Link key={s.id} to={`/creator-campaigns/${s.campaign_id}`} className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{s.campaign?.name || 'Campaign'}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Submitted {new Date(s.created_at).toLocaleDateString()}
                    {s.reward_amount && ` • $${Number(s.reward_amount).toFixed(2)}`}
                  </p>
                  {s.creator_notes && <p className="text-xs text-gray-400 mt-1 italic">"{s.creator_notes}"</p>}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {s.status === 'approved' && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-600">Approved</span>}
                  {s.status === 'pending' && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">Pending</span>}
                  {s.status === 'rejected' && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-500">Rejected</span>}
                  {s.ai_score !== null && <span className="text-xs text-gray-400">AI: {Number(s.ai_score).toFixed(0)}%</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
