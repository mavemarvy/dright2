import { Loader2, Lock, Trophy, Star, Zap, Award, ShoppingBag, ShoppingCart, Shield, Verified } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAchievements, ACHIEVEMENT_TIER_COLORS } from '../lib/trustEngine';

const ICON_MAP: Record<string, any> = {
  shopping_bag: ShoppingBag,
  shopping_cart: ShoppingCart,
  storefront: Award,
  emoji_events: Trophy,
  campaign: Zap,
  ads_click: Star,
  volunteer_activism: Shield,
  verified: Verified,
  shield: Shield,
  star: Star,
  bolt: Zap,
  workspace_premium: Award,
};

export default function AchievementsPage() {
  const { user } = useAuth();
  const { achievements, progress, loading } = useAchievements(user?.id);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  const progressMap = new Map(progress.map(p => [p.achievement_id, p]));
  const categories = [...new Set(achievements.map(a => a.category))];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Achievements</h1>
          <p className="text-sm text-gray-500">Unlock badges and earn XP as you grow on DRIGHT</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">{progress.filter(p => p.is_completed).length}</p>
          <p className="text-xs text-gray-500 mt-1">Unlocked</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{progress.reduce((sum, p) => sum + (p.is_completed ? p.achievement?.xp || 0 : 0), 0)}</p>
          <p className="text-xs text-gray-500 mt-1">Total XP</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-500">{progress.reduce((sum, p) => sum + (p.is_completed ? p.achievement?.points || 0 : 0), 0)}</p>
          <p className="text-xs text-gray-500 mt-1">Points</p>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">{cat}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {achievements.filter(a => a.category === cat).map(achv => {
              const prog = progressMap.get(achv.id);
              const isUnlocked = prog?.is_completed;
              const pct = prog ? Math.min((prog.progress / prog.target) * 100, 100) : 0;
              const Icon = ICON_MAP[achv.icon] || Award;
              const tierColor = ACHIEVEMENT_TIER_COLORS[achv.tier] || ACHIEVEMENT_TIER_COLORS.bronze;

              return (
                <div key={achv.id} className={`relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 ${isUnlocked ? '' : 'opacity-70'}`}>
                  {isUnlocked && <div className={`absolute -top-px -right-px w-20 h-20 rounded-full bg-gradient-to-br ${tierColor} opacity-10`} />}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isUnlocked ? `bg-gradient-to-br ${tierColor}` : 'bg-gray-100 dark:bg-gray-700'}`}>
                      {isUnlocked ? <Icon className="w-6 h-6 text-white" /> : <Lock className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{achv.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{achv.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{achv.xp} XP • {achv.points} pts</span>
                    <span className={`px-2 py-0.5 rounded-full capitalize text-xs font-medium ${isUnlocked ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isUnlocked ? 'Unlocked' : `${Math.round(pct)}%`}
                    </span>
                  </div>
                  {!isUnlocked && prog && (
                    <div className="mt-2 w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {isUnlocked && prog?.completed_at && (
                    <p className="text-xs text-gray-400 mt-2">Earned {new Date(prog.completed_at).toLocaleDateString()}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
