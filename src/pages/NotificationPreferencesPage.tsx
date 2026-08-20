import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Moon, Clock, VolumeX, Mail, Smartphone, MessageSquare,
  Sparkles, Eye, Check,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationPreferences, useNotificationMutes, ALL_CATEGORIES,
  type DeliveryChannel } from '../lib/notificationPreferences';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors min-h-[24px] ${
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : ''
      }`} />
    </button>
  );
}

function SettingCard({ icon: Icon, title, description, children }: {
  icon: LucideIcon; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

export default function NotificationPreferencesPage() {
  const { user } = useAuth();
  const { prefs, loading, update, toggleCategory, setDeliveryChannel } = useNotificationPreferences(user?.id || null);
  const { mutes, unmute } = useNotificationMutes(user?.id || null);
  const [savedToast] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notification Preferences</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Control how and when you receive notifications</p>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="mb-4">
          <SettingCard
            icon={Moon}
            title="Quiet Hours"
            description="Pause non-critical notifications during specified hours"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Quiet Hours</span>
                <Toggle
                  checked={!!prefs.quiet_hours_start}
                  onChange={(v) => update({
                    quiet_hours_start: v ? '22:00' : null,
                    quiet_hours_end: v ? '07:00' : null,
                  })}
                  label="Toggle quiet hours"
                />
              </div>
              {prefs.quiet_hours_start && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
                      <input
                        type="time"
                        value={prefs.quiet_hours_start || ''}
                        onChange={(e) => update({ quiet_hours_start: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
                      <input
                        type="time"
                        value={prefs.quiet_hours_end || ''}
                        onChange={(e) => update({ quiet_hours_end: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Allow critical security alerts during quiet hours</span>
                    <Toggle
                      checked={prefs.quiet_hours_critical_bypass}
                      onChange={(v) => update({ quiet_hours_critical_bypass: v })}
                      label="Allow critical alerts during quiet hours"
                    />
                  </div>
                </>
              )}
            </div>
          </SettingCard>
        </div>

        {/* Category Toggles */}
        <div className="mb-4">
          <SettingCard
            icon={Bell}
            title="Notification Categories"
            description="Enable or disable notifications by category"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_CATEGORIES.map(cat => {
                const enabled = prefs.category_toggles[cat.key] !== false;
                return (
                  <div key={cat.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.label}</span>
                    <Toggle
                      checked={enabled}
                      onChange={(v) => toggleCategory(cat.key, v)}
                      label={`Toggle ${cat.label} notifications`}
                    />
                  </div>
                );
              })}
            </div>
          </SettingCard>
        </div>

        {/* Delivery Channels */}
        <div className="mb-4">
          <SettingCard
            icon={Mail}
            title="Delivery Channels"
            description="Choose how you receive notifications"
          >
            <div className="space-y-3">
              {([
                { key: 'in_app' as DeliveryChannel, label: 'In-App', icon: Bell, available: true },
                { key: 'email' as DeliveryChannel, label: 'Email', icon: Mail, available: false },
                { key: 'push' as DeliveryChannel, label: 'Push Notifications', icon: Smartphone, available: false },
                { key: 'sms' as DeliveryChannel, label: 'SMS', icon: MessageSquare, available: false },
              ]).map(ch => (
                <div key={ch.key} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <ch.icon className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ch.label}</span>
                    {!ch.available && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400">Coming Soon</span>
                    )}
                  </div>
                  <Toggle
                    checked={prefs.delivery_channels[ch.key]}
                    onChange={(v) => setDeliveryChannel(ch.key, v)}
                    label={`Toggle ${ch.label} delivery`}
                  />
                </div>
              ))}
            </div>
          </SettingCard>
        </div>

        {/* AI Summaries */}
        <div className="mb-4">
          <SettingCard
            icon={Sparkles}
            title="AI Summaries"
            description="Smart daily, weekly, and monthly notification summaries"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable AI Summaries</span>
                <Toggle
                  checked={prefs.ai_summaries_enabled}
                  onChange={(v) => update({ ai_summaries_enabled: v })}
                  label="Toggle AI summaries"
                />
              </div>
              {prefs.ai_summaries_enabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Summary Frequency</label>
                  <div className="flex gap-2">
                    {(['daily', 'weekly', 'monthly'] as const).map(freq => (
                      <button
                        key={freq}
                        onClick={() => update({ ai_summary_frequency: freq })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                          prefs.ai_summary_frequency === freq
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SettingCard>
        </div>

        {/* Reminders */}
        <div className="mb-4">
          <SettingCard
            icon={Clock}
            title="Intelligent Reminders"
            description="How often should we send reminders for pending actions?"
          >
            <div className="flex gap-2 flex-wrap">
              {(['immediate', 'hourly', 'daily', 'weekly'] as const).map(freq => (
                <button
                  key={freq}
                  onClick={() => update({ reminder_frequency: freq })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    prefs.reminder_frequency === freq
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>
          </SettingCard>
        </div>

        {/* Accessibility */}
        <div className="mb-4">
          <SettingCard
            icon={Eye}
            title="Accessibility"
            description="Notification display preferences"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reduced Motion</span>
                <Toggle
                  checked={prefs.reduced_motion}
                  onChange={(v) => update({ reduced_motion: v })}
                  label="Toggle reduced motion"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">High Contrast</span>
                <Toggle
                  checked={prefs.high_contrast}
                  onChange={(v) => update({ high_contrast: v })}
                  label="Toggle high contrast"
                />
              </div>
            </div>
          </SettingCard>
        </div>

        {/* Active Mutes */}
        {mutes.length > 0 && (
          <div className="mb-4">
            <SettingCard
              icon={VolumeX}
              title="Active Mutes"
              description="Temporarily muted items"
            >
              <div className="space-y-2">
                {mutes.map(mute => (
                  <div key={mute.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {mute.target_label || mute.mute_type}
                      </p>
                      <p className="text-xs text-gray-400">
                        {mute.muted_until
                          ? `Until ${new Date(mute.muted_until).toLocaleString()}`
                          : 'Indefinitely'}
                      </p>
                    </div>
                    <button
                      onClick={() => unmute(mute.id)}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    >
                      Unmute
                    </button>
                  </div>
                ))}
              </div>
            </SettingCard>
          </div>
        )}

        {/* Save indicator */}
        {savedToast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-success text-white text-sm font-medium shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            Preferences saved
          </div>
        )}
      </div>
    </div>
  );
}
