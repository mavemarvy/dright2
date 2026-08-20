import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Loader2, AlertTriangle, CheckCircle, XCircle,
  Flag, RefreshCw, Eye, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

interface ModerationItem {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  risk_score: number;
  risk_flags: string[];
  status: string;
  auto_action: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  created_at: string;
}

interface ModerationRule {
  id: string;
  rule_type: string;
  pattern: string;
  action: string;
  severity: string;
  is_active: boolean;
}

export default function AdminAIModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [rules, setRules] = useState<ModerationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [activeTab, setActiveTab] = useState<'queue' | 'rules'>('queue');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, rulesRes] = await Promise.all([
        supabase.rpc('get_moderation_queue', { p_status: filter, p_limit: 50 }),
        supabase.from('ai_moderation_rules').select('*').order('severity', { ascending: false }),
      ]);
      setItems((queueRes.data as ModerationItem[]) || []);
      setRules((rulesRes.data as ModerationRule[]) || []);
    } catch (err) {
      console.error('Failed to load moderation data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, status: string) => {
    setActionLoading(id);
    try {
      await supabase.rpc('update_moderation_status', { p_id: id, p_status: status });
      await load();
    } catch (err) {
      console.error('Failed to update moderation status:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      await supabase.from('ai_moderation_rules').update({ is_active: !isActive, updated_at: new Date().toISOString() }).eq('id', ruleId);
      await load();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleRunModeration = async () => {
    setActionLoading('run');
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('approval_status', 'approved')
        .eq('is_active', true)
        .limit(50);

      if (products) {
        await Promise.all(products.map(p => supabase.rpc('moderate_product_content', { p_product_id: p.id })));
        await load();
      }
    } catch (err) {
      console.error('Failed to run moderation:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 60) return 'text-red-600 bg-red-50';
    if (score >= 30) return 'text-amber-600 bg-amber-50';
    return 'text-green-600 bg-green-50';
  };

  const getActionIcon = (action: string | null) => {
    if (action === 'reject') return <XCircle className="w-4 h-4 text-red-500" />;
    if (action === 'review') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Auto Moderation</h1>
          <p className="text-sm text-gray-500">Automated content review and moderation queue</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'queue' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Moderation Queue
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'rules' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Rules ({rules.length})
        </button>
        <button
          onClick={handleRunModeration}
          disabled={actionLoading === 'run'}
          className="ml-auto px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          {actionLoading === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run Moderation Scan
        </button>
      </div>

      {activeTab === 'queue' && (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            {['pending', 'reviewed', 'rejected', 'approved'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No items in the {filter} queue.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getRiskColor(item.risk_score)}`}>
                          Risk: {item.risk_score}/100
                        </span>
                        {getActionIcon(item.auto_action)}
                        <span className="text-xs text-gray-400 capitalize">{item.auto_action || 'pending'}</span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">{item.content}</p>
                      {item.risk_flags.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {item.risk_flags.map(flag => (
                            <span key={flag} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Flag className="w-2.5 h-2.5" /> {flag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(item.created_at).toLocaleString()} · {item.entity_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to={`/product/${item.entity_id}`}
                        target="_blank"
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="View listing"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {item.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(item.id, 'approved')}
                            disabled={actionLoading === item.id}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAction(item.id, 'rejected')}
                            disabled={actionLoading === item.id}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-3">Moderation Rules</h3>
          {rules.length === 0 ? (
            <p className="text-sm text-gray-400">No rules configured.</p>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm capitalize">{rule.rule_type}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        rule.severity === 'high' ? 'bg-red-100 text-red-700' :
                        rule.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{rule.severity}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${rule.action === 'reject' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {rule.action}
                      </span>
                    </div>
                    <code className="text-xs text-gray-400 mt-1 block">{rule.pattern}</code>
                  </div>
                  <button
                    onClick={() => handleToggleRule(rule.id, rule.is_active)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
