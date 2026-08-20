import { Megaphone, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

interface CampaignInfo {
  id: string;
  title: string;
  status: string;
  budget: number;
  spent: number;
  created_at: string;
}

interface CampaignCreatorProfileProps {
  campaigns: CampaignInfo[];
  profileName: string | null;
}

export function CampaignCreatorProfile({ campaigns, profileName }: CampaignCreatorProfileProps) {
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const completedCampaigns = campaigns.filter((c) => c.status === 'completed' || c.status === 'ended');
  const successRate = campaigns.length > 0 ? Math.round((completedCampaigns.length / campaigns.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Campaign Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CampaignStat label="Total Campaigns" value={campaigns.length} icon={Megaphone} color="text-indigo-500" />
        <CampaignStat label="Active" value={activeCampaigns.length} icon={TrendingUp} color="text-green-500" />
        <CampaignStat label="Completed" value={completedCampaigns.length} icon={CheckCircle} color="text-blue-500" />
        <CampaignStat label="Success Rate" value={`${successRate}%`} icon={Clock} color="text-purple-500" />
      </div>

      {/* Campaign List */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Campaigns</h3>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
              <Megaphone className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              {profileName || 'This creator'} hasn't launched any campaigns yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign, index) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
              >
                <Link
                  to={`/campaigns/${campaign.id}`}
                  className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                        {campaign.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          campaign.status === 'active'
                            ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {campaign.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          Budget: ${campaign.budget.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500">
                          Spent: ${campaign.spent.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignStat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Megaphone; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
