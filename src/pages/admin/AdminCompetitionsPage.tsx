import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, CheckCircle2, Crown, DollarSign, ExternalLink,
  Loader2, Medal, RefreshCw, Save, ShieldAlert, Trophy, Users, Wallet, XCircle,
} from 'lucide-react';
import {
  fetchAdminCompetitionDashboard,
  fetchMonthlyLeaderboard,
  formatChallengeReward,
  reviewCompetitionAward,
  subscribeToCompetitionActivity,
  updateAdminCompetitionAutoPayout,
  updateAdminMonthlyChallenge,
  type CompetitionAward,
  type CompetitionDashboardData,
  type MonthlyChallengeDefinition,
  type MonthlyLeaderboardEntry,
} from '../../lib/monthlyChallenges';

function displayName(entry: { full_name: string | null; username: string | null }) {
  return entry.full_name || entry.username || 'DRIGHT User';
}

function riskTone(score: number) {
  if (score >= 70) return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  if (score > 0) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
}

function statusTone(status: string) {
  if (status === 'paid' || status === 'auto_approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'flagged' || status === 'rejected') return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  if (status === 'approved') return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
}

export default function AdminCompetitionsPage() {
  const [data, setData] = useState<CompetitionDashboardData | null>(null);
  const [settings, setSettings] = useState<MonthlyChallengeDefinition[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [leaders, setLeaders] = useState<MonthlyLeaderboardEntry[]>([]);
  const [leaderTotal, setLeaderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [awardBusy, setAwardBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchAdminCompetitionDashboard();
      setData(next);
      setSettings(next.settings);
      setSelectedKey(prev => next.settings.some(s => s.challenge_key === prev) ? prev : (next.settings[0]?.challenge_key ?? ''));
      setLastUpdated(new Date());
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not load competition control center');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadLeaders = useCallback(async (key: string, silent = false) => {
    if (!key) return;
    if (!silent) setLeaderLoading(true);
    try {
      const result = await fetchMonthlyLeaderboard(key, 'current', 10, 0);
      setLeaders(result.entries);
      setLeaderTotal(result.total);
      setLastUpdated(new Date());
    } catch (error) {
      if (!silent) showMessage('error', error instanceof Error ? error.message : 'Could not load live ranking');
    } finally {
      if (!silent) setLeaderLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedKey) void loadLeaders(selectedKey);
  }, [selectedKey, loadLeaders]);

  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadDashboard(true);
        if (selectedKey) void loadLeaders(selectedKey, true);
      }, 350);
    };
    const unsubscribe = subscribeToCompetitionActivity(refresh);
    const interval = window.setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadDashboard, loadLeaders, selectedKey]);

  const selected = useMemo(
    () => settings.find(s => s.challenge_key === selectedKey) ?? null,
    [settings, selectedKey],
  );

  const pendingAwards = useMemo(
    () => (data?.awards ?? []).filter(a => a.status === 'pending'),
    [data?.awards],
  );

  const saveCompetition = async (setting: MonthlyChallengeDefinition) => {
    setSavingKey(setting.challenge_key);
    try {
      const saved = await updateAdminMonthlyChallenge(setting);
      setSettings(prev => prev.map(s => s.challenge_key === saved.challenge_key ? saved : s));
      showMessage('success', `${saved.title} saved`);
      await loadDashboard(true);
      if (selectedKey === saved.challenge_key) await loadLeaders(saved.challenge_key, true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not save competition');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleAutoPayout = async () => {
    if (!data) return;
    setPayoutBusy(true);
    try {
      const next = !data.payout_settings.auto_payout_enabled;
      await updateAdminCompetitionAutoPayout(next);
      showMessage(
        'success',
        next
          ? 'Auto prize payments enabled. Only zero-risk winners are paid automatically.'
          : 'Auto prize payments disabled. Winners will wait for admin review.',
      );
      await loadDashboard(true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update auto payout');
    } finally {
      setPayoutBusy(false);
    }
  };

  const actOnAward = async (award: CompetitionAward, action: 'recheck' | 'approve_pay' | 'reject') => {
    const note = notes[award.id]?.trim() || '';
    if (action === 'reject' && !note) {
      showMessage('error', 'Enter a rejection reason first.');
      return;
    }
    if (action === 'approve_pay' && award.fraud_flags.length > 0 && !note) {
      showMessage('error', 'This winner has fraud flags. Add review notes before overriding and paying.');
      return;
    }

    setAwardBusy(award.id);
    try {
      await reviewCompetitionAward(award.id, action, note);
      showMessage(
        'success',
        action === 'approve_pay' ? 'Prize approved and paid to the winner’s DRIGHT wallet.'
          : action === 'reject' ? 'Prize rejected and cancelled.'
          : 'Fraud signals rechecked.',
      );
      setNotes(prev => ({ ...prev, [award.id]: '' }));
      await loadDashboard(true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Competition award action failed');
    } finally {
      setAwardBusy(null);
    }
  };

  if (loading && !data) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  const stats = data?.stats;
  const autoEnabled = Boolean(data?.payout_settings.auto_payout_enabled);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {message && (
        <div className={`fixed right-4 top-4 z-[100] max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {message.text}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-black uppercase tracking-[0.16em]">
            <Trophy className="w-4 h-4" /> Competition Control Center
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-950 dark:text-white mt-2">Challenges, leaderboards & prize review</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-3xl">
            Control every monthly competition, inspect live rankings, review fraud signals, and approve prize payments from one admin page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { void loadDashboard(); if (selectedKey) void loadLeaders(selectedKey); }} className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <Link to="/challenges" target="_blank" className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-gray-950 text-white dark:bg-white dark:text-gray-950 text-sm font-bold">
            <ExternalLink className="w-4 h-4" /> Public page
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Activity className="w-3.5 h-3.5" />
        Live refresh: Supabase Realtime + 15-second safety refresh
        {lastUpdated && <span>· Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Active competitions', value: stats?.active_competitions ?? 0, icon: Trophy },
          { label: 'Ranked users', value: stats?.ranked_users ?? 0, icon: Users },
          { label: 'Pending review', value: stats?.pending_review ?? 0, icon: AlertTriangle },
          { label: 'Fraud flagged', value: stats?.flagged_awards ?? 0, icon: ShieldAlert },
          { label: 'Paid prizes', value: stats?.paid_awards ?? 0, icon: Wallet },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <card.icon className="w-5 h-5 text-amber-500 mb-3" />
            <p className="text-2xl font-black text-gray-950 dark:text-white">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <section className={`rounded-3xl border p-5 md:p-6 ${autoEnabled ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${autoEnabled ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-gray-950 dark:text-white">Automatic prize payments</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {autoEnabled
                  ? 'ON: winners with zero fraud risk are automatically credited to their DRIGHT wallet after monthly finalization. Any fraud signal is held for admin review.'
                  : 'OFF: no prize is paid automatically. Every winner remains in the review queue so an admin can verify referral or affiliate activity first.'}
              </p>
              <p className="text-xs text-gray-500 mt-2">Default and safest mode is OFF. You can turn it off again at any time.</p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={autoEnabled}
            disabled={payoutBusy}
            onClick={toggleAutoPayout}
            className={`relative w-16 h-9 rounded-full transition shrink-0 ${autoEnabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'} disabled:opacity-60`}
          >
            <span className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow transition-all ${autoEnabled ? 'left-8' : 'left-1'}`} />
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-black text-gray-950 dark:text-white">Competition settings</h2>
          <p className="text-sm text-gray-500 mt-1">Set titles, prize amounts, currency, visibility and leaderboard size.</p>
        </div>
        <div className="p-5 space-y-4">
          {settings.map(setting => (
            <div key={setting.challenge_key} className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-black text-gray-400">{setting.section}</p>
                  <p className="font-black text-gray-950 dark:text-white mt-1">{setting.challenge_key.replace(/_/g, ' ')}</p>
                </div>
                <button
                  onClick={() => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, enabled: !s.enabled } : s))}
                  className={`px-3 py-1.5 rounded-full text-xs font-black ${setting.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}
                >
                  {setting.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Title
                  <input value={setting.title} onChange={e => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, title: e.target.value } : s))} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                </label>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Reward currency
                  <input maxLength={3} value={setting.reward_currency} onChange={e => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, reward_currency: e.target.value.toUpperCase() } : s))} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mt-3">
                Description
                <textarea rows={2} value={setting.description ?? ''} onChange={e => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, description: e.target.value || null } : s))} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {(['reward_first','reward_second','reward_third'] as const).map((field, idx) => (
                  <label key={field} className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    {idx + 1}{idx === 0 ? 'st' : idx === 1 ? 'nd' : 'rd'} prize
                    <input type="number" min={0} value={setting[field]} onChange={e => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, [field]: Math.max(0, Number(e.target.value) || 0) } : s))} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                  </label>
                ))}
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Users/page
                  <input type="number" min={3} max={200} value={setting.display_limit} onChange={e => setSettings(prev => prev.map(s => s.challenge_key === setting.challenge_key ? { ...s, display_limit: Math.min(200, Math.max(3, Number(e.target.value) || 25)) } : s))} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  #1 {formatChallengeReward(setting.reward_first, setting.reward_currency)} · #2 {formatChallengeReward(setting.reward_second, setting.reward_currency)} · #3 {formatChallengeReward(setting.reward_third, setting.reward_currency)}
                </div>
                <button disabled={savingKey === setting.challenge_key} onClick={() => void saveCompetition(setting)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-black disabled:opacity-60">
                  {savingKey === setting.challenge_key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-950 dark:text-white">Live competition dashboard</h2>
            <p className="text-sm text-gray-500 mt-1">Zero-activity users are excluded from ranking.</p>
          </div>
          <select value={selectedKey} onChange={e => setSelectedKey(e.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm font-bold">
            {settings.filter(s => s.enabled).map(s => <option key={s.challenge_key} value={s.challenge_key}>{s.title}</option>)}
          </select>
        </div>
        <div className="p-5">
          {leaderLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
          ) : leaders.length === 0 ? (
            <div className="py-12 text-center">
              <Trophy className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="font-bold text-gray-700 dark:text-gray-200">No qualifying activity yet</p>
              <p className="text-sm text-gray-500 mt-1">The leaderboard will populate automatically when verified activity is recorded.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaders.map((entry, idx) => (
                <div key={entry.user_id} className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${idx === 0 ? 'bg-amber-300 text-gray-950' : idx === 1 ? 'bg-gray-300 text-gray-900' : idx === 2 ? 'bg-orange-300 text-gray-950' : 'bg-gray-200 dark:bg-gray-800'}`}>
                    {idx === 0 ? <Crown className="w-4 h-4" /> : idx < 3 ? <Medal className="w-4 h-4" /> : entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-950 dark:text-white truncate">{displayName(entry)}</p>
                    <p className="text-xs text-gray-500">{entry.primary_metric.toLocaleString()} primary · {entry.secondary_metric.toLocaleString()} secondary</p>
                  </div>
                  <div className="text-xs font-bold text-gray-500">#{entry.rank}</div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-2">{leaderTotal.toLocaleString()} qualifying ranked user{leaderTotal === 1 ? '' : 's'}</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-black text-gray-950 dark:text-white">Prize verification queue</h2>
          <p className="text-sm text-gray-500 mt-1">Review finalized winners before paying when auto payout is OFF, or investigate any winner automatically held for fraud signals.</p>
        </div>
        <div className="p-5 space-y-4">
          {pendingAwards.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
              <p className="font-bold text-gray-700 dark:text-gray-200">No prize reviews waiting</p>
            </div>
          ) : pendingAwards.map(award => (
            <div key={award.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center font-black text-violet-700 dark:text-violet-300">#{award.rank}</div>
                  <div>
                    <p className="font-black text-gray-950 dark:text-white">{displayName(award)}</p>
                    <p className="text-xs text-gray-500 mt-1">{award.challenge_key.replace(/_/g, ' ')} · {award.period_start}</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-2">{formatChallengeReward(award.reward_amount, award.reward_currency)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-black ${riskTone(award.risk_score)}`}>Risk {award.risk_score}/100</span>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-black ${statusTone(award.review_status)}`}>{award.review_status.replace(/_/g, ' ')}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-950/60 p-3">
                  <p className="text-xs text-gray-500">Competition result</p>
                  <p className="font-bold text-gray-900 dark:text-gray-100 mt-1">Primary {award.primary_metric.toLocaleString()} · Secondary {award.secondary_metric.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-950/60 p-3">
                  <p className="text-xs text-gray-500">Fraud screening</p>
                  {award.fraud_flags.length === 0
                    ? <p className="font-bold text-emerald-600 mt-1">No active fraud signals</p>
                    : <div className="mt-1 space-y-1">{award.fraud_flags.map(flag => <p key={flag} className="font-semibold text-red-600">• {flag}</p>)}</div>}
                </div>
              </div>

              <textarea
                rows={2}
                value={notes[award.id] ?? ''}
                onChange={e => setNotes(prev => ({ ...prev, [award.id]: e.target.value }))}
                placeholder={award.fraud_flags.length > 0 ? 'Required: explain why you are approving despite fraud flags, or enter the rejection reason.' : 'Optional review notes'}
                className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
              />

              <div className="flex flex-wrap gap-2 mt-3">
                <button disabled={awardBusy === award.id} onClick={() => void actOnAward(award, 'recheck')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold disabled:opacity-60">
                  <RefreshCw className="w-4 h-4" /> Recheck fraud
                </button>
                <button disabled={awardBusy === award.id} onClick={() => void actOnAward(award, 'approve_pay')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60">
                  {awardBusy === award.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />} Approve & pay
                </button>
                <button disabled={awardBusy === award.id} onClick={() => void actOnAward(award, 'reject')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {(data?.awards ?? []).some(a => a.status === 'paid' || a.status === 'cancelled') && (
        <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-black text-gray-950 dark:text-white">Prize history</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {(data?.awards ?? []).filter(a => a.status !== 'pending').slice(0, 30).map(award => (
              <div key={award.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-950 dark:text-white truncate">{displayName(award)} · {award.challenge_key.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500 mt-1">{award.period_start} · rank #{award.rank} · {award.payout_mode ?? 'manual review'}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-gray-950 dark:text-white">{formatChallengeReward(award.reward_amount, award.reward_currency)}</p>
                  <span className={`inline-block mt-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${statusTone(award.status)}`}>{award.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
