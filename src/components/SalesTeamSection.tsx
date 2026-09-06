import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Award,
  Target,
  Users,
  Plus,
  X,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
  Star,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MARKETER_WEEKLY_TARGETS, ADVERTISER_REQUIREMENTS } from '../lib/pricing';

type ProgressionRule={stage_key:string;stage_label:string;weekly_target:number;required_success_streak:number;next_stage_key:string|null};

interface Profile {
  id: string;
  marketer_level: number;
  advertiser_grade: string | null;
  weekly_sales_count: number;
  total_sales_count: number;
  consecutive_weeks_streak: number;
  social_media_links: string[] | null;
  marketer_status: string;
  advertiser_status: string;
  locked_balance: number;
  available_balance: number;
  downgraded_at: string | null;
}

interface Props {
  profile: Profile | null;
  socialLinks: string[];
  setSocialLinks: (v: string[]) => void;
  showMarketerForm: boolean;
  setShowMarketerForm: (v: boolean) => void;
  marketerSubmitting: boolean;
  marketerError: string | null;
  marketerSuccess: boolean;
  setMarketerError: (v: string | null) => void;
  setMarketerSuccess: (v: boolean) => void;
  setMarketerSubmitting: (v: boolean) => void;
  advertiserSubmitting: boolean;
  advertiserError: string | null;
  advertiserSuccess: boolean;
  setAdvertiserError: (v: string | null) => void;
  setAdvertiserSuccess: (v: boolean) => void;
  setAdvertiserSubmitting: (v: boolean) => void;
  refreshProfile: () => Promise<void>;
}

export default function SalesTeamSection({
  profile,
  socialLinks,
  setSocialLinks,
  showMarketerForm,
  setShowMarketerForm,
  marketerSubmitting,
  marketerError,
  marketerSuccess,
  setMarketerError,
  setMarketerSuccess,
  setMarketerSubmitting,
  advertiserSubmitting,
  advertiserError,
  advertiserSuccess,
  setAdvertiserError,
  setAdvertiserSuccess,
  setAdvertiserSubmitting,
  refreshProfile,
}: Props) {
  const [progressionRules,setProgressionRules]=useState<ProgressionRule[]>([]);
  useEffect(()=>{let live=true;supabase.from('sales_progression_rules').select('stage_key,stage_label,weekly_target,required_success_streak,next_stage_key').eq('active',true).then(({data})=>{if(live&&data)setProgressionRules(data as ProgressionRule[])});return()=>{live=false}},[]);
  const ruleMap=useMemo(()=>Object.fromEntries(progressionRules.map(r=>[r.stage_key,r])),[progressionRules]);
  if (!profile) return null;

  const isMarketer = profile.marketer_status === 'approved';
  const isAdvertiser = profile.advertiser_status === 'approved';
  const marketerPending = profile.marketer_status === 'pending';
  const advertiserPending = profile.advertiser_status === 'pending';

  // Advertiser eligibility: L5 with 2+ consecutive weeks streak at 500/week
  const l5Rule=ruleMap.marketer_5;
  const eligibleForAdvertiser =
    isMarketer &&
    profile.marketer_level === 5 &&
    profile.consecutive_weeks_streak >= (l5Rule?.required_success_streak ?? 2) &&
    !isAdvertiser &&
    !advertiserPending;

  const handleMarketerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMarketerError(null);

    const validLinks = socialLinks.filter((l) => l.trim().length > 0);
    if (validLinks.length === 0) {
      setMarketerError('Please provide at least one social media link');
      return;
    }

    setMarketerSubmitting(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          social_media_links: validLinks,
          marketer_status: 'pending',
        })
        .eq('id', profile.id);

      if (error) throw error;

      setMarketerSuccess(true);
      setShowMarketerForm(false);
      await refreshProfile();
      setTimeout(() => setMarketerSuccess(false), 3500);
    } catch (err) {
      console.error('Marketer registration error:', err);
      setMarketerError('Failed to submit application. Please try again.');
    } finally {
      setMarketerSubmitting(false);
    }
  };

  const handleAdvertiserApply = async () => {
    setAdvertiserError(null);
    setAdvertiserSubmitting(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ advertiser_status: 'pending' })
        .eq('id', profile.id);

      if (error) throw error;

      setAdvertiserSuccess(true);
      await refreshProfile();
      setTimeout(() => setAdvertiserSuccess(false), 3500);
    } catch (err) {
      console.error('Advertiser application error:', err);
      setAdvertiserError('Failed to apply. Please try again.');
    } finally {
      setAdvertiserSubmitting(false);
    }
  };

  const addLinkField = () => setSocialLinks([...socialLinks, '']);
  const removeLinkField = (idx: number) =>
    setSocialLinks(socialLinks.filter((_, i) => i !== idx));
  const updateLink = (idx: number, value: string) =>
    setSocialLinks(socialLinks.map((l, i) => (i === idx ? value : l)));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <Users className="w-5 h-5 text-primary-600" />
        Sales Team Status
      </h3>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          label="Affiliate"
          active={true}
          icon={Star}
          color="primary"
        />
        <StatusBadge
          label={`Marketer L${profile.marketer_level}`}
          active={isMarketer}
          pending={marketerPending}
          icon={TrendingUp}
          color="success"
        />
        <StatusBadge
          label={isAdvertiser ? `Advertiser ${profile.advertiser_grade}` : 'Advertiser'}
          active={isAdvertiser}
          pending={advertiserPending}
          icon={Award}
          color="warning"
        />
      </div>

      {/* Stats grid */}
      {(isMarketer || isAdvertiser) && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Weekly Sales"
            value={profile.weekly_sales_count}
            icon={Target}
          />
          <StatCard
            label="Total Sales"
            value={profile.total_sales_count}
            icon={TrendingUp}
          />
          <StatCard
            label="Streak"
            value={`${profile.consecutive_weeks_streak}w`}
            icon={Zap}
          />
        </div>
      )}

      {/* Balance display for marketers/advertisers */}
      {(isMarketer || isAdvertiser) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-blue-600 font-medium">Available Balance</p>
            <p className="text-lg font-bold text-blue-700">
              ${Number(profile.available_balance || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs text-amber-600 font-medium">Locked Balance</p>
            <p className="text-lg font-bold text-amber-700">
              ${Number(profile.locked_balance || 0).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Marketer registration */}
      {!isMarketer && !marketerPending && !isAdvertiser && (
        <div>
          {!showMarketerForm ? (
            <button
              onClick={() => setShowMarketerForm(true)}
              className="w-full py-3 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Register as Marketer
            </button>
          ) : (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleMarketerSubmit}
              className="space-y-3"
            >
              <p className="text-sm text-gray-600">
                Submit your social media links. Admin will verify your audience weekly.
              </p>
              {socialLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => updateLink(idx, e.target.value)}
                    placeholder="https://instagram.com/yourpage"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm"
                  />
                  {socialLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLinkField(idx)}
                      className="p-2 text-gray-400 hover:text-error"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addLinkField}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add another link
              </button>

              {marketerError && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {marketerError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={marketerSubmitting}
                  className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {marketerSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Application
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarketerForm(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </div>
      )}

      {marketerPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
          <p className="text-sm text-amber-700">
            Your Marketer application is pending admin review.
          </p>
        </div>
      )}

      {/* Advertiser application */}
      {eligibleForAdvertiser && (
        <div className="bg-gradient-to-r from-warning/10 to-orange-50 border border-warning/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-warning" />
            <p className="font-medium text-gray-900">Eligible for Advertiser!</p>
          </div>
          <p className="text-sm text-gray-600">
            You've maintained a 500/week streak for 2+ weeks. Apply to become an Advertiser
            and unlock higher tier subscriptions.
          </p>
          {advertiserError && (
            <div className="flex items-center gap-2 text-error text-sm">
              <AlertCircle className="w-4 h-4" />
              {advertiserError}
            </div>
          )}
          <button
            onClick={handleAdvertiserApply}
            disabled={advertiserSubmitting}
            className="w-full py-2.5 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {advertiserSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Apply for Advertiser
              </>
            )}
          </button>
        </div>
      )}

      {advertiserPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
          <p className="text-sm text-amber-700">
            Your Advertiser application is pending admin review.
          </p>
        </div>
      )}

      {/* Success messages */}
      <AnimatePresence>
        {marketerSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 bg-success-muted text-success rounded-xl p-3 text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Marketer application submitted!
          </motion.div>
        )}
        {advertiserSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 bg-success-muted text-success rounded-xl p-3 text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Advertiser application submitted!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progression info */}
      {isMarketer && !isAdvertiser && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Marketer Progression
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  profile.marketer_level >= level
                    ? 'bg-success-muted text-success'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                L{level}: {ruleMap[`marketer_${level}`]?.weekly_target ?? MARKETER_WEEKLY_TARGETS[level]}/wk
              </div>
            ))}
          </div>
          {profile.marketer_level === 5 && (
            <p className="text-xs text-gray-500">
              Streak: {profile.consecutive_weeks_streak}/{l5Rule?.required_success_streak ?? 2} weeks needed for Advertiser eligibility
            </p>
          )}
        </div>
      )}

      {isAdvertiser && profile.advertiser_grade && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Advertiser Grade: {profile.advertiser_grade}
          </p>
          <div className="text-xs text-gray-600 space-y-1">
            <p>
              Total Sales: {profile.total_sales_count} /{' '}
              {ADVERTISER_REQUIREMENTS[profile.advertiser_grade]?.totalSales || 'N/A'}
            </p>
            <p>
              Weekly Target: {ruleMap[`advertiser_${profile.advertiser_grade.toLowerCase()}`]?.weekly_target ?? ADVERTISER_REQUIREMENTS[profile.advertiser_grade]?.weeklyTarget ?? 'N/A'} / week
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  label,
  active,
  pending,
  icon: Icon,
  color,
}: {
  label: string;
  active: boolean;
  pending?: boolean;
  icon: React.ElementType;
  color: 'primary' | 'success' | 'warning';
}) {
  const colorClasses = {
    primary: active
      ? 'bg-primary-100 text-primary-700 border-primary-200'
      : 'bg-gray-100 text-gray-400 border-gray-200',
    success: active
      ? 'bg-success-muted text-success border-success/20'
      : pending
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-gray-100 text-gray-400 border-gray-200',
    warning: active
      ? 'bg-warning/10 text-warning border-warning/20'
      : pending
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-gray-100 text-gray-400 border-gray-200',
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${colorClasses[color]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {pending && <span className="text-xs">(Pending)</span>}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <Icon className="w-4 h-4 text-gray-400 mx-auto mb-1" />
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
