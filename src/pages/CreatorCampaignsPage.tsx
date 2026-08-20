import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Clock, DollarSign, Bookmark, BarChart3,
  Wallet, Trophy, Plus, Search, Flame,
} from 'lucide-react';
import { useCampaigns, useCategories, useWorkerProfile } from '../lib/campaignHooks';
import { LEVEL_ICONS, LEVEL_COLORS, type WorkerLevel } from '../lib/campaignTypes';
import { CreatorCampaignAnalytics } from '../components/analytics/EntityPerformance';
import { formatCurrency } from '../lib/currency';

const SORT_TABS = [
  { key: 'trending' as const, label: 'Trending', icon: Flame },
  { key: 'new' as const, label: 'New', icon: Sparkles },
  { key: 'reward' as const, label: 'Highest Paying', icon: DollarSign },
  { key: 'ending' as const, label: 'Ending Soon', icon: Clock },
];

export default function CreatorCampaignsPage() {
  const [sortBy, setSortBy] = useState<'trending' | 'new' | 'reward' | 'ending'>('trending');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const { campaigns, loading, fetchMore, hasMore } = useCampaigns({ sortBy, search, category: selectedCategory });
  const { categories } = useCategories();
  const { profile: workerProfile } = useWorkerProfile();

  return (
    <>
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-primary-500 to-blue-600 rounded-3xl p-6 mb-6 text-white">
        <h1 className="text-2xl font-bold">Creator Campaigns</h1>
        <p className="text-white/80 text-sm mt-1">Complete tasks from creators and brands. Get paid for verified work.</p>
        <div className="flex items-center gap-2 mt-4">
          <Link to="/creator-campaigns/create" className="px-4 py-2 bg-white text-primary-600 rounded-xl text-sm font-bold hover:bg-white/90 transition-colors flex items-center gap-1">
            <Plus className="w-4 h-4" /> Create Campaign
          </Link>
          <Link to="/creator-campaigns/wallet" className="px-4 py-2 bg-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/30 transition-colors flex items-center gap-1">
            <Wallet className="w-4 h-4" /> Wallet
          </Link>
          <Link to="/creator-campaigns/leaderboard" className="px-4 py-2 bg-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/30 transition-colors flex items-center gap-1">
            <Trophy className="w-4 h-4" /> Leaderboard
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Trophy} label="Your Level" value={workerProfile ? `${LEVEL_ICONS[workerProfile.level as WorkerLevel]} ${workerProfile.level.charAt(0).toUpperCase() + workerProfile.level.slice(1)}` : '—'} color={workerProfile ? LEVEL_COLORS[workerProfile.level as WorkerLevel] : 'from-gray-300 to-gray-400'} />
        <StatCard icon={DollarSign} label="Total Earnings" value={workerProfile ? `$${Number(workerProfile.total_earnings).toFixed(2)}` : formatCurrency(0)} color="from-green-400 to-green-600" />
        <StatCard icon={BarChart3} label="Completed" value={workerProfile ? String(workerProfile.completed_tasks) : '0'} color="from-blue-400 to-blue-600" />
        <StatCard icon={Sparkles} label="Success Rate" value={workerProfile ? `${Number(workerProfile.success_rate).toFixed(0)}%` : '—'} color="from-purple-400 to-purple-600" />
      </div>

      {/* Quick Nav */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <QuickLink to="/creator-campaigns" icon={Sparkles} label="Discover" active />
        <QuickLink to="/creator-campaigns/my-tasks" icon={Bookmark} label="My Tasks" />
        <QuickLink to="/creator-campaigns/dashboard" icon={BarChart3} label="Creator Dashboard" />
        <QuickLink to="/creator-campaigns/wallet" icon={Wallet} label="Wallet" />
        <QuickLink to="/creator-campaigns/leaderboard" icon={Trophy} label="Leaderboard" />
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {SORT_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSortBy(tab.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                sortBy === tab.key ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(undefined)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Campaign Grid */}
      {loading && campaigns.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-64 animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No campaigns found</p>
          <p className="text-sm text-gray-400 mt-1">Check back soon or create your own campaign!</p>
          <Link to="/creator-campaigns/create" className="mt-4 inline-flex items-center gap-1 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> Create Campaign
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
          {hasMore && (
            <div className="text-center mt-6">
              <button onClick={() => fetchMore()} disabled={loading} className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>

    {/* Campaign Analytics */}
    {campaigns && campaigns.length > 0 && (
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Campaign Analytics</h2>
        <CreatorCampaignAnalytics campaignId={campaigns[0].id} />
      </div>
    )}
    </>
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

function QuickLink({ to, icon: Icon, label, active }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );
}

function CampaignCard({ campaign }: { campaign: import('../lib/campaignTypes').Campaign }) {
  const reward = Number(campaign.reward_per_completion);
  const maxWorkers = campaign.max_workers;
  const progress = maxWorkers ? Math.min(100, (campaign.workers_count / maxWorkers) * 100) : 0;
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at) : null;
  const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <Link to={`/creator-campaigns/${campaign.id}`} className="block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group">
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary-50 text-primary-700 capitalize">{campaign.task_type.replace(/_/g, ' ')}</span>
          {campaign.is_featured && <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-600">Featured</span>}
        </div>
        <h3 className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-1">{campaign.name}</h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{campaign.description || 'No description'}</p>

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          <span className="capitalize">{campaign.difficulty}</span>
          {campaign.estimated_completion_time && <span>{campaign.estimated_completion_time}</span>}
          {daysLeft !== null && daysLeft >= 0 && <span className={daysLeft <= 3 ? 'text-red-500 font-medium' : ''}>{daysLeft}d left</span>}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div>
            <p className="text-lg font-bold text-green-600">${reward.toFixed(2)}</p>
            <p className="text-xs text-gray-400">per task</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{campaign.workers_count}{maxWorkers ? `/${maxWorkers}` : ''}</p>
            <p className="text-xs text-gray-400">workers</p>
          </div>
        </div>

        {maxWorkers && progress > 0 && (
          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
            <div className="bg-primary-500 h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
