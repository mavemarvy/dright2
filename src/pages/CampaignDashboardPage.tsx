import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Eye, MousePointerClick, DollarSign,
  Pause, Play, Copy, XCircle, Calendar, Clock, Loader2, BarChart3,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSellerCampaigns, useSellerAnalytics, useCampaignActions } from '../lib/promotionHooks';
import { type CampaignStatus } from '../lib/promotionEngine';
import { formatCurrency } from '../lib/currency';

const STATUS_STYLES: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Pending' },
  active: { bg: 'bg-green-50', text: 'text-green-600', label: 'Active' },
  paused: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Paused' },
  expired: { bg: 'bg-gray-50', text: 'text-gray-400', label: 'Expired' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-500', label: 'Cancelled' },
  rejected: { bg: 'bg-red-50', text: 'text-red-500', label: 'Rejected' },
};

export default function CampaignDashboardPage() {
  const { user } = useAuth();
    const { campaigns, loading } = useSellerCampaigns(user?.id);
  const { analytics } = useSellerAnalytics(user?.id);
  const actions = useCampaignActions();
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all');


  const filteredCampaigns = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter(c => c.status === filter);
  }, [campaigns, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Promotion Campaigns</h1>
            <p className="text-sm text-gray-500">Manage your advertising campaigns</p>
          </div>
        </div>
        <Link to="/market" className="px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-primary-500" />
              <span className="text-xs text-gray-400">Total Campaigns</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_campaigns}</p>
            <p className="text-xs text-green-500">{analytics.active_campaigns} active</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-400">Impressions</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_impressions.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <MousePointerClick className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-gray-400">Clicks</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_clicks.toLocaleString()}</p>
            <p className="text-xs text-gray-400">CTR: {analytics.avg_ctr.toFixed(2)}%</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-400">Total Spend</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.total_spend)}</p>
            <p className="text-xs text-gray-400">CPC: {formatCurrency(analytics.avg_cpc)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {(['all', 'active', 'paused', 'pending', 'expired', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_STYLES[f]?.label || f}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-60">{campaigns.filter(c => c.status === f).length}</span>
            )}
          </button>
        ))}
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-16">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No campaigns yet</p>
          <p className="text-sm text-gray-400 mt-1">Promote a listing to get started</p>
          <Link to="/market" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map((campaign, idx) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.05, 0.3) }}
              className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[campaign.status].bg} ${STATUS_STYLES[campaign.status].text}`}>
                      {STATUS_STYLES[campaign.status].label}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{campaign.goal.replace(/_/g, ' ')}</span>
                  </div>
                  <Link to={`/product/${campaign.listing_id}`} className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-sm truncate block">
                    {campaign.listing_type} · {campaign.listing_id.slice(0, 8)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {campaign.duration_days} days</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {formatCurrency(campaign.budget)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(campaign.end_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-3 text-xs">
                    <div>
                      <p className="text-gray-400">Impr.</p>
                      <p className="font-bold text-gray-900">{campaign.actual_impressions.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Clicks</p>
                      <p className="font-bold text-gray-900">{campaign.actual_clicks.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Spend</p>
                      <p className="font-bold text-gray-900">{formatCurrency(campaign.actual_spend)}</p>
                    </div>
                  </div>
                </div>
              </div>
              {campaign.status === 'active' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => actions.pause(campaign.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                  <button onClick={() => actions.duplicate(campaign.id, user!.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </button>
                  <button onClick={() => actions.cancel(campaign.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button onClick={() => actions.extend(campaign.id, 7)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> Extend 7d
                  </button>
                </div>
              )}
              {campaign.status === 'paused' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => actions.resume(campaign.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                    <Play className="w-3.5 h-3.5" /> Resume
                  </button>
                </div>
              )}
              {campaign.status === 'pending' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  <span className="text-xs text-amber-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Awaiting payment
                  </span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
