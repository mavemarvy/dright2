import { useState } from 'react';
import {
  AlertTriangle, Loader2, ShieldAlert, CheckCircle2, XCircle,
  TrendingUp, User,
} from 'lucide-react';
import { useFraudCases } from '../../lib/adminIntelligenceHooks';
import { updateFraudCase, logAdminAction } from '../../lib/adminIntelligence';

const CASE_TYPE_LABELS: Record<string, string> = {
  click_fraud: 'Click Fraud',
  review_fraud: 'Review Fraud',
  referral_fraud: 'Referral Fraud',
  promotion_abuse: 'Promotion Abuse',
  coupon_abuse: 'Coupon Abuse',
  duplicate_account: 'Duplicate Account',
  suspicious_login: 'Suspicious Login',
  unusual_purchase: 'Unusual Purchase',
};

export default function AdminFraudPage() {
  const { cases, loading, refetch } = useFraudCases();
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? cases : cases.filter(c => c.status === filter);

  const handleAction = async (id: string, status: string, caseType: string) => {
    await updateFraudCase(id, { status, resolution: `Marked as ${status}` });
    await logAdminAction('fraud_action', 'fraud_case', id, { status, case_type: caseType });
    refetch();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fraud Monitoring</h1>
          <p className="text-sm text-gray-500">Detect and investigate suspicious activity</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'open', 'investigating', 'resolved', 'dismissed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors capitalize ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No fraud cases detected</p>
          <p className="text-sm text-gray-400 mt-1">The marketplace is safe</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      c.status === 'open' ? 'bg-red-50 text-red-600' :
                      c.status === 'investigating' ? 'bg-amber-50 text-amber-600' :
                      c.status === 'resolved' ? 'bg-green-50 text-green-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>{c.status}</span>
                    <span className="text-xs text-gray-400">{CASE_TYPE_LABELS[c.case_type] || c.case_type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className={`w-4 h-4 ${c.risk_score >= 70 ? 'text-red-500' : c.risk_score >= 40 ? 'text-amber-500' : 'text-gray-400'}`} />
                      <span className="text-sm font-bold text-gray-900">{c.risk_score}</span>
                      <span className="text-xs text-gray-400">risk</span>
                    </div>
                    {c.user_id && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <User className="w-3 h-3" /> {c.user_id.slice(0, 8)}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{new Date(c.created_at).toLocaleString()}</p>
                </div>
                {(c.status === 'open' || c.status === 'investigating') && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleAction(c.id, 'investigating', c.case_type)} title="Investigate" className="p-2 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors">
                      <TrendingUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(c.id, 'resolved', c.case_type)} title="Resolve" className="p-2 text-green-500 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(c.id, 'dismissed', c.case_type)} title="Dismiss" className="p-2 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
