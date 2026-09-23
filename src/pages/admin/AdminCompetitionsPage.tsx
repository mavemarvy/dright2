import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Crown, DollarSign, ExternalLink,
  History, ImageMinus, ImagePlus, Loader2, Medal, RefreshCw, Save, Shuffle, ShieldAlert, Sparkles, Trophy, Upload, Users, Wallet, XCircle,
} from 'lucide-react';
import {
  fetchAdminCompetitionDashboard,
  fetchAdminSimulatedCompetitors,
  fetchAdminSimulationAutomation,
  fetchMonthlyLeaderboard,
  formatChallengeReward,
  generateAdminSimulationPlan,
  importAdminSimulatedCompetitors,
  removeAdminSimulatedCompetitorAvatar,
  reviewCompetitionAward,
  subscribeToCompetitionActivity,
  updateAdminCompetitionAutoPayout,
  updateAdminCompetitionHistoryVisibility,
  updateAdminCompetitionSimulation,
  updateAdminMonthlyChallenge,
  updateAdminSimulatedScore,
  updateAdminSimulationAutomation,
  uploadAdminSimulatedCompetitorAvatar,
  uploadAndRandomlyAssignAdminSimulatedAvatars,
  type CompetitionAward,
  type CompetitionDashboardData,
  type MonthlyChallengeDefinition,
  type MonthlyLeaderboardEntry,
  type SimulatedCompetitor,
  type SimulationAutomationSettings,
} from '../../lib/monthlyChallenges';

const REWARD_CURRENCIES = [
  'USD', 'NGN', 'GBP', 'EUR', 'GHS', 'ZAR', 'KES', 'CAD', 'AUD',
  'NZD', 'AED', 'SAR', 'INR', 'JPY', 'CNY', 'BRL', 'XOF',
];

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

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    referral_signup: 'Referral signup',
    seller_sale: 'Completed seller sale',
    affiliate_sale: 'Affiliate-attributed sale',
    approved_listing: 'Approved listing',
    starter_affiliate_sale: 'Starter affiliate sale',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

function parseCompetitorNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const original of raw.split(/\r?\n/)) {
    let line = original.trim();
    if (!line) continue;
    line = line.replace(/^\s*\d+\s*[,.)-]\s*/, '').trim();
    line = line.replace(/^["']|["']$/g, '').trim();
    line = line.replace(/[-‐‑‒–—−]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || /^no\.?\s*,?\s*full\s*name$/i.test(line) || /^full\s*name$/i.test(line)) continue;
    const key = line.toLocaleLowerCase();
    if (line.length >= 2 && line.length <= 120 && !seen.has(key)) {
      seen.add(key);
      names.push(line);
    }
  }
  return names;
}

function distributionToText(distribution: Record<string, number>): string {
  return Object.entries(distribution)
    .map(([score, count]) => [Number(score), Math.max(0, Math.trunc(Number(count) || 0))] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([score, count]) => `${score}=${count}`)
    .join('\n');
}

function parseDistributionText(raw: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const original of raw.split(/\r?\n|,/)) {
    const line = original.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s*(?:=|:|x|×)\s*(\d+)$/i);
    if (!match) throw new Error(`Invalid distribution line: "${line}". Use score=count, for example 0=2000.`);
    const score = String(Math.max(0, Math.trunc(Number(match[1]))));
    const count = Math.max(0, Math.trunc(Number(match[2])));
    result[score] = (result[score] ?? 0) + count;
  }
  return result;
}

export default function AdminCompetitionsPage() {
  const [data, setData] = useState<CompetitionDashboardData | null>(null);
  const [settings, setSettings] = useState<MonthlyChallengeDefinition[]>([]);
  const dirtyKeys = useRef(new Set<string>());
  const simDirtyIds = useRef(new Set<string>());
  const automationDirty = useRef(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [leaders, setLeaders] = useState<MonthlyLeaderboardEntry[]>([]);
  const [leaderTotal, setLeaderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [awardBusy, setAwardBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [simEntries, setSimEntries] = useState<SimulatedCompetitor[]>([]);
  const [simTotal, setSimTotal] = useState(0);
  const [simOffset, setSimOffset] = useState(0);
  const [simLoading, setSimLoading] = useState(false);
  const [simBusy, setSimBusy] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState<string | null>(null);
  const [bulkAvatarFiles, setBulkAvatarFiles] = useState<File[]>([]);
  const [bulkAvatarBusy, setBulkAvatarBusy] = useState(false);
  const [automation, setAutomation] = useState<SimulationAutomationSettings | null>(null);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [distributionText, setDistributionText] = useState('');
  const [simSearch, setSimSearch] = useState('');
  const [simSearchApplied, setSimSearchApplied] = useState('');

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchAdminCompetitionDashboard();
      setData(next);
      setSettings(prev => {
        if (dirtyKeys.current.size === 0) return next.settings;
        return next.settings.map(server => (
          dirtyKeys.current.has(server.challenge_key)
            ? (prev.find(local => local.challenge_key === server.challenge_key) ?? server)
            : server
        ));
      });
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
      const result = await fetchMonthlyLeaderboard(key, 'current', 25, 0);
      setLeaders(result.entries);
      setLeaderTotal(result.total);
      setLastUpdated(new Date());
    } catch (error) {
      if (!silent) showMessage('error', error instanceof Error ? error.message : 'Could not load live ranking');
    } finally {
      if (!silent) setLeaderLoading(false);
    }
  }, []);

  const loadSimulated = useCallback(async (key: string, offset = 0, silent = false, search = '') => {
    if (!key) return;
    if (!silent) setSimLoading(true);
    try {
      const result = await fetchAdminSimulatedCompetitors(key, 50, offset, search);
      setSimEntries(prev => {
        if (!silent || simDirtyIds.current.size === 0) return result.entries;
        return result.entries.map(server => (
          simDirtyIds.current.has(server.id)
            ? (prev.find(local => local.id === server.id) ?? server)
            : server
        ));
      });
      setSimTotal(result.total);
      setSimOffset(result.offset);
    } catch (error) {
      if (!silent) showMessage('error', error instanceof Error ? error.message : 'Could not load AI challengers');
    } finally {
      if (!silent) setSimLoading(false);
    }
  }, []);

  const loadAutomation = useCallback(async (key: string, silent = false) => {
    if (!key) return;
    if (!silent) setAutomationBusy(true);
    try {
      const next = await fetchAdminSimulationAutomation(key);
      if (!silent || !automationDirty.current) {
        setAutomation(next);
        setDistributionText(distributionToText(next.exact_distribution));
      }
    } catch (error) {
      if (!silent) showMessage('error', error instanceof Error ? error.message : 'Could not load monthly automation settings');
    } finally {
      if (!silent) setAutomationBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedKey) {
      simDirtyIds.current.clear();
      void loadLeaders(selectedKey);
      void loadSimulated(selectedKey, 0, false, simSearchApplied);
      void loadAutomation(selectedKey);
    }
  }, [selectedKey, loadAutomation, loadLeaders, loadSimulated]);

  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadDashboard(true);
        if (selectedKey) {
          void loadLeaders(selectedKey, true);
          if (data?.simulation_settings.enabled) void loadSimulated(selectedKey, simOffset, true, simSearchApplied);
          void loadAutomation(selectedKey, true);
        }
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
  }, [data?.simulation_settings.enabled, loadAutomation, loadDashboard, loadLeaders, loadSimulated, selectedKey, simOffset, simSearchApplied]);

  const pendingAwards = useMemo(
    () => (data?.awards ?? []).filter(a => a.status === 'pending'),
    [data?.awards],
  );

  const patchSetting = (key: string, patch: Partial<MonthlyChallengeDefinition>) => {
    dirtyKeys.current.add(key);
    setSettings(prev => prev.map(item => item.challenge_key === key ? { ...item, ...patch } : item));
  };

  const saveCompetition = async (setting: MonthlyChallengeDefinition) => {
    setSavingKey(setting.challenge_key);
    try {
      const saved = await updateAdminMonthlyChallenge(setting);
      dirtyKeys.current.delete(setting.challenge_key);
      setSettings(prev => prev.map(s => s.challenge_key === saved.challenge_key ? saved : s));
      showMessage('success', `${saved.title} saved. Prize values and currency are now persisted.`);
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
          ? 'Auto prize payments enabled. Only zero-risk real winners are paid automatically.'
          : 'Auto prize payments disabled. Winners will wait for admin review.',
      );
      await loadDashboard(true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update auto payout');
    } finally {
      setPayoutBusy(false);
    }
  };

  const updateHistoryVisibility = async (months: number) => {
    setHistoryBusy(true);
    try {
      await updateAdminCompetitionHistoryVisibility(months);
      showMessage('success', months === 0 ? 'Public winner history hidden.' : `Users can now view the last ${months} month${months === 1 ? '' : 's'} of finalized results.`);
      await loadDashboard(true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update public history');
    } finally {
      setHistoryBusy(false);
    }
  };

  const toggleSimulation = async () => {
    if (!data) return;
    setSimulationBusy(true);
    try {
      const next = !data.simulation_settings.enabled;
      await updateAdminCompetitionSimulation(next);
      showMessage(
        'success',
        next
          ? 'AI challenger mode enabled. Public leaderboard profiles now use the same presentation as every other participant; prize eligibility remains protected internally.'
          : 'AI challenger mode disabled. Only DRIGHT account participants appear on the public leaderboard.',
      );
      await loadDashboard(true);
      if (selectedKey) {
        await loadLeaders(selectedKey, true);
        await loadSimulated(selectedKey, 0, true, simSearchApplied);
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update AI challenger mode');
    } finally {
      setSimulationBusy(false);
    }
  };

  const importNames = async () => {
    const names = parseCompetitorNames(importText);
    if (names.length === 0) {
      showMessage('error', 'Paste one full name per line, or numbered CSV rows, before importing.');
      return;
    }
    setImportBusy(true);
    try {
      const result = await importAdminSimulatedCompetitors(names);
      showMessage('success', `Imported ${result.inserted.toLocaleString()} new AI challenger profiles. Total: ${result.total.toLocaleString()}.`);
      setImportText('');
      if (selectedKey) await loadSimulated(selectedKey, 0, false, simSearchApplied);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not import AI challenger profiles');
    } finally {
      setImportBusy(false);
    }
  };

  const updateSimEntry = (id: string, patch: Partial<SimulatedCompetitor>) => {
    const scoreEdit = ['base_score', 'target_score', 'increment_amount', 'increment_interval_seconds']
      .some(key => Object.prototype.hasOwnProperty.call(patch, key));
    const shouldDirty = scoreEdit || Object.prototype.hasOwnProperty.call(patch, 'enabled');
    if (shouldDirty) simDirtyIds.current.add(id);
    setSimEntries(prev => prev.map(entry => (
      entry.id === id
        ? {
            ...entry,
            ...patch,
            ...(scoreEdit ? { enabled: true, managed_by_automation: false } : {}),
          }
        : entry
    )));
  };

  const uploadSimAvatar = async (entry: SimulatedCompetitor, file: File) => {
    setAvatarBusy(entry.id);
    try {
      const avatarUrl = await uploadAdminSimulatedCompetitorAvatar(entry.id, file);
      updateSimEntry(entry.id, { avatar_url: avatarUrl });
      showMessage('success', `${entry.display_name} profile picture updated.`);
      if (selectedKey) {
        await Promise.all([
          loadSimulated(selectedKey, simOffset, true, simSearchApplied),
          loadLeaders(selectedKey, true),
        ]);
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not upload profile picture');
    } finally {
      setAvatarBusy(null);
    }
  };

  const removeSimAvatar = async (entry: SimulatedCompetitor) => {
    setAvatarBusy(entry.id);
    try {
      await removeAdminSimulatedCompetitorAvatar(entry.id);
      updateSimEntry(entry.id, { avatar_url: null });
      simDirtyIds.current.delete(entry.id);
      showMessage('success', `${entry.display_name} profile picture removed.`);
      if (selectedKey) await loadLeaders(selectedKey, true);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not remove profile picture');
    } finally {
      setAvatarBusy(null);
    }
  };

  const addBulkAvatarFiles = (files: File[]) => {
    const imageFiles = files.filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    const next = [...bulkAvatarFiles, ...imageFiles].slice(0, 100);
    setBulkAvatarFiles(next);
    if (files.length > imageFiles.length) {
      showMessage('error', 'Only JPG, PNG, and WebP pictures are accepted.');
    } else if (bulkAvatarFiles.length + imageFiles.length > 100) {
      showMessage('error', 'A batch can contain at most 100 pictures.');
    }
  };

  const assignBulkAvatars = async () => {
    if (bulkAvatarFiles.length === 0) {
      showMessage('error', 'Choose or paste at least one profile picture first.');
      return;
    }
    setBulkAvatarBusy(true);
    try {
      const result = await uploadAndRandomlyAssignAdminSimulatedAvatars(bulkAvatarFiles);
      showMessage('success', `Randomly assigned ${result.assigned.toLocaleString()} profile picture${result.assigned === 1 ? '' : 's'}.`);
      setBulkAvatarFiles([]);
      if (selectedKey) {
        await Promise.all([
          loadSimulated(selectedKey, simOffset, true, simSearchApplied),
          loadLeaders(selectedKey, true),
        ]);
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not randomly assign profile pictures');
    } finally {
      setBulkAvatarBusy(false);
    }
  };

  const patchAutomation = (patch: Partial<SimulationAutomationSettings>) => {
    automationDirty.current = true;
    setAutomation(prev => prev ? { ...prev, ...patch } : prev);
  };

  const saveAutomation = async () => {
    if (!automation || !selectedKey) return;
    setAutomationBusy(true);
    try {
      const exactDistribution = parseDistributionText(distributionText);
      const saved = await updateAdminSimulationAutomation(selectedKey, {
        ...automation,
        exact_distribution: exactDistribution,
      });
      automationDirty.current = false;
      setAutomation(saved);
      setDistributionText(distributionToText(saved.exact_distribution));
      showMessage('success', 'Monthly competitor automation settings saved.');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not save monthly automation settings');
    } finally {
      setAutomationBusy(false);
    }
  };

  const applyAutomationPlan = async () => {
    if (!automation || !selectedKey) return;
    setPlanBusy(true);
    try {
      const exactDistribution = parseDistributionText(distributionText);
      const saved = await updateAdminSimulationAutomation(selectedKey, {
        ...automation,
        exact_distribution: exactDistribution,
      });
      automationDirty.current = false;
      setAutomation(saved);
      if (!saved.enabled) throw new Error('Turn monthly automation ON before applying a plan.');
      const result = await generateAdminSimulationPlan(selectedKey);
      const generated = Number(result.generated ?? 0);
      showMessage('success', `Monthly plan generated for ${generated.toLocaleString()} managed competitor${generated === 1 ? '' : 's'}.`);
      simDirtyIds.current.clear();
      await Promise.all([
        loadAutomation(selectedKey, true),
        loadSimulated(selectedKey, 0, false, simSearchApplied),
        loadLeaders(selectedKey, true),
      ]);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not generate monthly automation plan');
    } finally {
      setPlanBusy(false);
    }
  };

  const saveSimEntry = async (entry: SimulatedCompetitor) => {
    if (!selectedKey) return;
    setSimBusy(entry.id);
    try {
      await updateAdminSimulatedScore(entry.id, selectedKey, {
        base_score: entry.base_score,
        target_score: entry.target_score,
        increment_amount: entry.increment_amount,
        increment_interval_seconds: entry.increment_interval_seconds,
        enabled: entry.enabled,
      });
      simDirtyIds.current.delete(entry.id);
      showMessage('success', `${entry.display_name} score rule saved for this month.`);
      await Promise.all([
        loadSimulated(selectedKey, simOffset, true, simSearchApplied),
        loadLeaders(selectedKey, true),
      ]);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not save AI challenger score rule');
    } finally {
      setSimBusy(null);
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
  const simulationEnabled = Boolean(data?.simulation_settings.enabled);
  const visibleHistoryMonths = Number(data?.history_settings.visible_months ?? 1);

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
          <h1 className="text-2xl md:text-3xl font-black text-gray-950 dark:text-white mt-2">Challenges, live activity, history & prize review</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-3xl">
            Control the five monthly competitions, inspect current participants, review activity and previous winners, configure public history, and manage prize payments.
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <Activity className="w-3.5 h-3.5" />
        Live refresh: Supabase Realtime + 15-second safety refresh
        {lastUpdated && <span>· Updated {lastUpdated.toLocaleTimeString()}</span>}
        {dirtyKeys.current.size > 0 && <span className="font-bold text-amber-600">· {dirtyKeys.current.size} unsaved competition draft{dirtyKeys.current.size === 1 ? '' : 's'} protected from auto-refresh</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Active competitions', value: stats?.active_competitions ?? 0, icon: Trophy },
          { label: 'Active real users', value: stats?.active_users ?? 0, icon: Users },
          { label: 'Ranked users', value: stats?.ranked_users ?? 0, icon: Crown },
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
                  ? 'ON: real winners with zero fraud risk are automatically credited to their DRIGHT wallet after monthly finalization. Any fraud signal is held for admin review.'
                  : 'OFF: no prize is paid automatically. Every real winner remains in the review queue so an admin can verify referral or affiliate activity first.'}
              </p>
              <p className="text-xs text-gray-500 mt-2">AI challengers are never award recipients.</p>
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
          <p className="text-sm text-gray-500 mt-1">Prize drafts no longer get overwritten by realtime refresh. Choose the reward currency, enter prize amounts, then save each competition.</p>
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
                  onClick={() => patchSetting(setting.challenge_key, { enabled: !setting.enabled })}
                  className={`px-3 py-1.5 rounded-full text-xs font-black ${setting.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}
                >
                  {setting.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Title
                  <input value={setting.title} onChange={e => patchSetting(setting.challenge_key, { title: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                </label>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Reward currency
                  <select value={setting.reward_currency} onChange={e => patchSetting(setting.challenge_key, { reward_currency: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm">
                    {!REWARD_CURRENCIES.includes(setting.reward_currency) && <option value={setting.reward_currency}>{setting.reward_currency}</option>}
                    {REWARD_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mt-3">
                Description
                <textarea rows={2} value={setting.description ?? ''} onChange={e => patchSetting(setting.challenge_key, { description: e.target.value || null })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {(['reward_first','reward_second','reward_third'] as const).map((field, idx) => (
                  <label key={field} className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    {idx + 1}{idx === 0 ? 'st' : idx === 1 ? 'nd' : 'rd'} prize
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={setting[field]}
                      onChange={e => patchSetting(setting.challenge_key, { [field]: Math.max(0, Number(e.target.value) || 0) } as Partial<MonthlyChallengeDefinition>)}
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
                    />
                  </label>
                ))}
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  Users/page
                  <input type="number" min={3} max={200} value={setting.display_limit} onChange={e => patchSetting(setting.challenge_key, { display_limit: Math.min(200, Math.max(3, Number(e.target.value) || 25)) })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
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
            <p className="text-sm text-gray-500 mt-1">Every participant is numbered from #1 to the end of the board, including zero-score participants. Higher records move upward automatically, with earlier achievement time breaking equal-score ties.</p>
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
              <p className="font-bold text-gray-700 dark:text-gray-200">No participants are available yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaders.map(entry => (
                <div key={entry.user_id} className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${entry.rank === 1 ? 'bg-amber-300 text-gray-950' : entry.rank === 2 ? 'bg-gray-300 text-gray-900' : entry.rank === 3 ? 'bg-orange-300 text-gray-950' : 'bg-gray-200 dark:bg-gray-800'}`}>
                    {entry.rank === 1 ? <Crown className="w-4 h-4" /> : entry.rank <= 3 ? <Medal className="w-4 h-4" /> : entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-950 dark:text-white truncate">{displayName(entry)}</p>
                    <p className="text-xs text-gray-500">{entry.primary_metric.toLocaleString()} primary · {entry.secondary_metric.toLocaleString()} secondary</p>
                  </div>
                  <div className="text-xs font-bold text-gray-500">#{entry.rank}</div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-2">{leaderTotal.toLocaleString()} total participant{leaderTotal === 1 ? '' : 's'} in this board view.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-violet-500" />
            <h2 className="font-black text-gray-950 dark:text-white">Winner history & public history visibility</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">Choose how many completed months users can inspect. Admin keeps up to 12 months in this dashboard.</p>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 6, 12].map(months => (
              <button
                key={months}
                disabled={historyBusy}
                onClick={() => void updateHistoryVisibility(months)}
                className={`rounded-xl px-3 py-2 text-sm font-black border ${visibleHistoryMonths === months ? 'border-violet-500 bg-violet-500 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} disabled:opacity-60`}
              >
                {months === 0 ? 'Hide public history' : `Last ${months} month${months === 1 ? '' : 's'}`}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {(data?.history ?? []).length === 0 ? (
              <div className="rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-6 text-center">
                <History className="w-9 h-9 mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-700 dark:text-gray-200">No finalized historical leaderboard snapshots yet</p>
                <p className="text-xs text-gray-500 mt-1">Completed monthly results will appear here after finalization. No fake winner records are created.</p>
              </div>
            ) : (
              (data?.history ?? []).map(snapshot => {
                const challenge = settings.find(s => s.challenge_key === snapshot.challenge_key);
                const winners = snapshot.entries.filter(entry => entry.rank > 0).slice(0, 3);
                return (
                  <div key={`${snapshot.period_start}-${snapshot.challenge_key}`} className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="font-black text-gray-950 dark:text-white">{challenge?.title ?? snapshot.challenge_key.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-500">{new Date(`${snapshot.period_start}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
                      </div>
                      <p className="text-xs text-gray-400">Finalized {snapshot.finalized_at ? new Date(snapshot.finalized_at).toLocaleString() : '—'}</p>
                    </div>
                    {winners.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-500">No qualifying winner for this month.</p>
                    ) : (
                      <div className="mt-3 grid sm:grid-cols-3 gap-2">
                        {winners.map(winner => (
                          <div key={winner.user_id} className="rounded-xl bg-gray-50 dark:bg-gray-950/60 p-3">
                            <p className="text-[10px] font-black uppercase text-gray-400">#{winner.rank} winner</p>
                            <p className="font-bold text-gray-950 dark:text-white mt-1 truncate">{displayName(winner)}</p>
                            <p className="text-xs text-gray-500 mt-1">{winner.primary_metric.toLocaleString()} primary</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-blue-500" />
            <h2 className="font-black text-gray-950 dark:text-white">Current-month activity feed</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">A direct admin trail of referrals, completed sales, affiliate attribution, approved listings and Starter affiliate sales used by the competition system.</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {(data?.recent_activity ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No qualifying activity events recorded this month.</div>
          ) : (data?.recent_activity ?? []).slice(0, 50).map((event, index) => (
            <div key={`${event.event_at}-${event.event_type}-${event.actor_id}-${index}`} className="p-4 flex items-start gap-3">
              <Activity className="w-4 h-4 mt-1 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-950 dark:text-white">
                  {event.actor_name || event.actor_username || 'DRIGHT user'} · {eventLabel(event.event_type)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {event.target_name ? `Target: ${event.target_name} · ` : ''}
                  Value: {event.value.toLocaleString()}
                  {event.order_id ? ` · Order ${event.order_id.slice(0, 8)}…` : ''}
                </p>
              </div>
              <p className="text-[10px] text-gray-400 shrink-0">{event.event_at ? new Date(event.event_at).toLocaleString() : '—'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-3xl border overflow-hidden ${simulationEnabled ? 'border-cyan-300 dark:border-cyan-900' : 'border-gray-200 dark:border-gray-800'} bg-white dark:bg-gray-900`}>
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex gap-3">
              <div className="w-11 h-11 rounded-2xl bg-cyan-500 text-white flex items-center justify-center shrink-0"><Bot className="w-5 h-5" /></div>
              <div>
                <h2 className="font-black text-gray-950 dark:text-white">AI challenger gamification</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                  Managed competitor profiles are configured only from this admin area. The public challenge board uses the normal participant layout, while prize payout eligibility remains restricted to real DRIGHT accounts.
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={simulationEnabled}
              disabled={simulationBusy}
              onClick={toggleSimulation}
              className={`relative w-16 h-9 rounded-full transition shrink-0 ${simulationEnabled ? 'bg-cyan-600' : 'bg-gray-300 dark:bg-gray-700'} disabled:opacity-60`}
            >
              <span className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow transition-all ${simulationEnabled ? 'left-8' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-2xl bg-cyan-50 dark:bg-cyan-950/20 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Bulk profile import</p>
            <p className="text-xs text-gray-500 mt-1">Paste one name per line or numbered CSV rows. Row numbers are stripped, and dash/minus characters inside imported names are converted to normal spaces automatically.</p>
            <textarea
              rows={5}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"Iwegbu Marvelous Praise\nJohn Henry Joseph\nMantey Afriyie Elorm"}
              className="mt-3 w-full rounded-xl border border-cyan-200 dark:border-cyan-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">{parseCompetitorNames(importText).length.toLocaleString()} valid unique name{parseCompetitorNames(importText).length === 1 ? '' : 's'} ready</p>
              <button disabled={importBusy || !importText.trim()} onClick={() => void importNames()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />} Import profiles
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-200 dark:border-cyan-900 bg-white dark:bg-gray-950 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0">
                <ImagePlus className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-black text-gray-950 dark:text-white">Random profile-picture batch</p>
                <p className="text-xs text-gray-500 mt-1">
                  Choose or paste up to 100 JPG, PNG, or WebP pictures. DRIGHT uploads them and assigns each picture to a different active managed competitor at random, replacing the previous picture when needed.
                </p>
              </div>
            </div>

            <div
              tabIndex={0}
              onPaste={event => {
                const pasted = Array.from(event.clipboardData.files);
                if (pasted.length) {
                  event.preventDefault();
                  addBulkAvatarFiles(pasted);
                }
              }}
              className="mt-3 rounded-xl border-2 border-dashed border-cyan-200 dark:border-cyan-900 p-4 text-center outline-none focus:border-cyan-500"
            >
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                {bulkAvatarFiles.length ? `${bulkAvatarFiles.length} picture${bulkAvatarFiles.length === 1 ? '' : 's'} ready` : 'Tap to select pictures or focus here and paste images'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Maximum 100 pictures per batch · 5 MB each</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-4 py-2 text-sm font-black text-white dark:text-gray-950">
                <Upload className="w-4 h-4" /> Select pictures
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={bulkAvatarBusy}
                  onChange={event => {
                    addBulkAvatarFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {bulkAvatarFiles.length > 0 && (
                <button
                  disabled={bulkAvatarBusy}
                  onClick={() => setBulkAvatarFiles([])}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-bold text-gray-500 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
              <button
                disabled={bulkAvatarBusy || bulkAvatarFiles.length === 0}
                onClick={() => void assignBulkAvatars()}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {bulkAvatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                Randomly assign {bulkAvatarFiles.length || ''} picture{bulkAvatarFiles.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/15 p-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <p className="font-black text-gray-950 dark:text-white">Monthly randomized score automation</p>
                </div>
                <p className="text-xs text-gray-500 mt-1 max-w-3xl">
                  Configure how many managed competitors can increase this month, their score range, unique top targets, optional exact score buckets, and whether last month’s top profiles may be selected again. A fresh randomized plan is created automatically at 00:10 UTC on the first day of every month.
                </p>
              </div>
              {automation && (
                <button
                  role="switch"
                  aria-checked={automation.enabled}
                  onClick={() => patchAutomation({ enabled: !automation.enabled })}
                  className={`relative w-14 h-8 rounded-full shrink-0 transition ${automation.enabled ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${automation.enabled ? 'left-7' : 'left-1'}`} />
                </button>
              )}
            </div>

            {automationBusy && !automation ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
            ) : automation && (
              <>
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Bots allowed to increase
                    <input type="number" min={0} max={20000} value={automation.active_competitor_count} onChange={e => patchAutomation({ active_competitor_count: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Minimum month-end score
                    <input type="number" min={0} value={automation.min_target} onChange={e => patchAutomation({ min_target: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Highest month-end score
                    <input type="number" min={0} value={automation.max_target} onChange={e => patchAutomation({ max_target: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Unique top positions
                    <input type="number" min={0} max={20} value={automation.top_target_count} onChange={e => patchAutomation({ top_target_count: Math.max(0, Math.min(20, Math.trunc(Number(e.target.value) || 0))) })} className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    Total month-end records (optional)
                    <input
                      type="number"
                      min={0}
                      value={automation.total_target_records ?? ''}
                      placeholder="Auto-distribute"
                      onChange={e => patchAutomation({ total_target_records: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                      className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300">
                    Allow previous top bots to win again
                    <input type="checkbox" checked={automation.allow_repeat_winners} onChange={e => patchAutomation({ allow_repeat_winners: e.target.checked })} className="w-4 h-4" />
                  </label>
                </div>

                <label className="block mt-3 text-xs font-bold text-gray-600 dark:text-gray-300">
                  Exact score buckets (optional)
                  <textarea
                    rows={5}
                    value={distributionText}
                    onChange={e => {
                      automationDirty.current = true;
                      setDistributionText(e.target.value);
                    }}
                    placeholder={"0=2500\n1=1800\n2=1400\n3=900\n10=250"}
                    className="mt-1 w-full rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm font-mono"
                  />
                  <span className="mt-1 block font-normal text-gray-500">
                    Format: score=count. Example 0=2500 keeps 2,500 managed competitors at zero. Buckets are applied first; remaining selected profiles are randomized inside the min/max range.
                  </span>
                </label>

                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl bg-white dark:bg-gray-950 p-3"><span className="text-gray-500">Automated now</span><p className="font-black text-gray-950 dark:text-white mt-1">{automation.current_plan.automated_profiles.toLocaleString()}</p></div>
                  <div className="rounded-xl bg-white dark:bg-gray-950 p-3"><span className="text-gray-500">Manual overrides</span><p className="font-black text-gray-950 dark:text-white mt-1">{automation.current_plan.manual_profiles.toLocaleString()}</p></div>
                  <div className="rounded-xl bg-white dark:bg-gray-950 p-3"><span className="text-gray-500">Highest target</span><p className="font-black text-gray-950 dark:text-white mt-1">{automation.current_plan.highest_target?.toLocaleString() ?? '—'}</p></div>
                  <div className="rounded-xl bg-white dark:bg-gray-950 p-3"><span className="text-gray-500">Zero targets</span><p className="font-black text-gray-950 dark:text-white mt-1">{automation.current_plan.zero_targets.toLocaleString()}</p></div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button disabled={automationBusy || planBusy} onClick={() => void saveAutomation()} className="inline-flex items-center gap-2 rounded-xl border border-violet-300 dark:border-violet-800 px-4 py-2 text-sm font-black text-violet-700 dark:text-violet-300 disabled:opacity-50">
                    {automationBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save automation
                  </button>
                  <button disabled={planBusy || automationBusy} onClick={() => void applyAutomationPlan()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                    {planBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Apply & reroll this month
                  </button>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <p className="font-black text-gray-950 dark:text-white">Monthly score rules · {settings.find(s => s.challenge_key === selectedKey)?.title ?? selectedKey}</p>
                <p className="text-xs text-gray-500 mt-1">Manual edits are protected from the 15-second refresh. Changing a current score or month-end target automatically switches that profile to a manual override so the automation will not overwrite it this month.</p>
              </div>
              <p className="text-xs text-gray-400">{simTotal.toLocaleString()} imported AI challenger profile{simTotal === 1 ? '' : 's'}</p>
            </div>

            <div className="mb-3 flex flex-col sm:flex-row gap-2">
              <input
                value={simSearch}
                onChange={e => setSimSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const next = simSearch.trim();
                    setSimSearchApplied(next);
                    void loadSimulated(selectedKey, 0, false, next);
                  }
                }}
                placeholder="Search imported challenger by full name"
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
              />
              <button
                onClick={() => {
                  const next = simSearch.trim();
                  setSimSearchApplied(next);
                  void loadSimulated(selectedKey, 0, false, next);
                }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-black"
              >
                Search
              </button>
              {simSearchApplied && (
                <button
                  onClick={() => {
                    setSimSearch('');
                    setSimSearchApplied('');
                    void loadSimulated(selectedKey, 0, false, '');
                  }}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-bold text-gray-500"
                >
                  Clear
                </button>
              )}
            </div>

            {simLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
            ) : simEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">No AI challenger profiles imported yet.</div>
            ) : (
              <div className="space-y-3">
                {simEntries.map(entry => (
                  <div key={entry.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-black text-gray-500">
                          {entry.avatar_url
                            ? <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                            : entry.display_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-gray-950 dark:text-white truncate">{entry.display_name}</p>
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"><Bot className="w-3 h-3" /> AI challenger</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${entry.managed_by_automation ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                              {entry.managed_by_automation ? 'Automation' : 'Manual'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Effective score now: {entry.effective_score.toLocaleString()}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-black text-gray-700 dark:text-gray-200">
                              {avatarBusy === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                              {entry.avatar_url ? 'Replace picture' : 'Upload picture'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={avatarBusy === entry.id}
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  e.currentTarget.value = '';
                                  if (file) void uploadSimAvatar(entry, file);
                                }}
                              />
                            </label>
                            {entry.avatar_url && (
                              <button
                                disabled={avatarBusy === entry.id}
                                onClick={() => void removeSimAvatar(entry)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 px-2.5 py-1.5 text-[11px] font-black text-red-600 dark:text-red-300 disabled:opacity-50"
                              >
                                <ImageMinus className="w-3.5 h-3.5" /> Remove picture
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => updateSimEntry(entry.id, { enabled: !entry.enabled })}
                        className={`rounded-full px-3 py-1.5 text-xs font-black ${entry.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}
                      >
                        {entry.enabled ? 'Rule enabled' : 'Rule disabled'}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                        Current score
                        <input type="number" min={0} value={entry.base_score} onChange={e => updateSimEntry(entry.id, { base_score: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                        Month-end target
                        <input type="number" min={0} value={entry.target_score ?? ''} placeholder="No cap" onChange={e => updateSimEntry(entry.id, { target_score: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                        Add each interval
                        <input type="number" min={0} value={entry.increment_amount} onChange={e => updateSimEntry(entry.id, { increment_amount: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                        Interval
                        <select value={entry.increment_interval_seconds} onChange={e => updateSimEntry(entry.id, { increment_interval_seconds: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm">
                          <option value={60}>Every 1 minute</option>
                          <option value={300}>Every 5 minutes</option>
                          <option value={900}>Every 15 minutes</option>
                          <option value={3600}>Every 1 hour</option>
                          <option value={21600}>Every 6 hours</option>
                          <option value={86400}>Every 1 day</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button disabled={simBusy === entry.id} onClick={() => void saveSimEntry(entry)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                        {simBusy === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save score rule
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3">
                  <button disabled={simOffset <= 0 || simLoading} onClick={() => void loadSimulated(selectedKey, Math.max(0, simOffset - 50), false, simSearchApplied)} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-bold disabled:opacity-40">Previous 50</button>
                  <p className="text-xs text-gray-500">{simTotal === 0 ? 0 : simOffset + 1}–{Math.min(simOffset + 50, simTotal)} of {simTotal.toLocaleString()}</p>
                  <button disabled={simOffset + 50 >= simTotal || simLoading} onClick={() => void loadSimulated(selectedKey, simOffset + 50, false, simSearchApplied)} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-bold disabled:opacity-40">Next 50</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-black text-gray-950 dark:text-white">Prize verification queue</h2>
          <p className="text-sm text-gray-500 mt-1">Review finalized real winners before paying when auto payout is OFF, or investigate any winner automatically held for fraud signals.</p>
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
            <h2 className="font-black text-gray-950 dark:text-white">Prize payment history</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {(data?.awards ?? []).filter(a => a.status !== 'pending').slice(0, 50).map(award => (
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
