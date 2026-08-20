import { useState, useEffect, useMemo } from 'react';
import { useProviderSettings, useHealthChecks, useProviderLogs, saveProviderSettings, testProviderConnection, logProviderEvent, updateProvider } from '../../lib/integrationHooks';
import { ENVIRONMENT_LABELS, LOG_ACTION_LABELS, HEALTH_LABELS, HEALTH_COLORS, type IntegrationProvider, type ConfigFieldSchema } from '../../lib/integrationTypes';
import { useAuth } from '../../contexts/AuthContext';
import { X, Save, Zap, RefreshCw, Eye, EyeOff, Shield, Webhook, FileText, Activity } from 'lucide-react';

export default function ProviderConfigModal({ provider, onClose }: { provider: IntegrationProvider; onClose: () => void }) {
  const { user } = useAuth();
  const { settings, loading: settingsLoading, refetch: refetchSettings } = useProviderSettings(provider.id);
  const { checks } = useHealthChecks(provider.id);
  const { logs } = useProviderLogs(10, provider.id);
  const [tab, setTab] = useState<'config' | 'health' | 'webhooks' | 'logs'>('config');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const schema = provider.config_schema;
  const schemaEntries = useMemo(() => Object.entries(schema) as [string, ConfigFieldSchema][], [schema]);

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const [key, field] of schemaEntries) {
      const existing = settings.find((s) => s.setting_key === key);
      map[key] = existing?.setting_value ?? String(field.default ?? '');
    }
    setFormValues(map);
  }, [settings, schemaEntries]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveProviderSettings(provider.id, formValues, schema);
      await logProviderEvent({
        provider_id: provider.id,
        provider_key: provider.provider_key,
        admin_id: user?.id,
        action: 'settings_updated',
      });
      await updateProvider(provider.id, { is_connected: true, status: 'active' });
      void refetchSettings();
      setSaveMsg('Settings saved successfully');
    } catch (err) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testProviderConnection({ ...provider, is_connected: false }, user?.id ?? '');
      setSaveMsg(result.success ? `Connection successful (${result.responseTimeMs}ms)` : `Connection failed: ${result.error}`);
    } catch (err) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setTesting(false);
  };

  const recentChecks = checks.slice(0, 10);
  const recentLogs = logs.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-gray-900">{provider.provider_name}</h2>
            <p className="text-xs text-gray-400">{provider.provider_key} · {ENVIRONMENT_LABELS[provider.environment as keyof typeof ENVIRONMENT_LABELS] ?? provider.environment}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 px-5">
          {(['config', 'health', 'webhooks', 'logs'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t === 'config' ? 'Configuration' : t === 'health' ? 'Health' : t === 'webhooks' ? 'Webhooks' : 'Audit Logs'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Config Tab */}
          {tab === 'config' && (
            <>
              {settingsLoading && <div className="text-sm text-gray-400">Loading settings...</div>}
              {schemaEntries.length === 0 && !settingsLoading && (
                <div className="text-center py-8 text-gray-400">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  This provider has no configuration fields. It may be a built-in or default provider.
                </div>
              )}
              {schemaEntries.length > 0 && (
                <div className="space-y-3">
                  {schemaEntries.map(([key, field]) => (
                    <div key={key}>
                      <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        {field.required && <span className="text-red-500">*</span>}
                        {field.type === 'secret' && (
                          <button type="button" onClick={() => setShowSecrets((s) => ({ ...s, [key]: !s[key] }))}
                            className="ml-1 text-gray-400 hover:text-gray-600">
                            {showSecrets[key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </label>
                      {field.type === 'select' && field.options ? (
                        <select
                          value={formValues[key] ?? ''}
                          onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : field.type === 'secret' ? (
                        <input
                          type={showSecrets[key] ? 'text' : 'password'}
                          value={formValues[key] ?? ''}
                          onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                          placeholder={field.type === 'secret' ? '••••••••' : ''}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      ) : field.type === 'number' ? (
                        <input
                          type="number"
                          value={formValues[key] ?? ''}
                          onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                          min={field.min}
                          max={field.max}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      ) : (
                        <input
                          type={field.type === 'email' ? 'email' : 'text'}
                          value={formValues[key] ?? ''}
                          onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      )}
                    </div>
                  ))}

                  {saveMsg && (
                    <div className={`text-sm p-2 rounded-xl ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {saveMsg}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
                    </button>
                    <button onClick={handleTest} disabled={testing}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-xl disabled:opacity-50">
                      {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Test Connection
                    </button>
                  </div>
                </div>
              )}

              {/* Features list */}
              {provider.supported_features.length > 0 && (
                <div className="pt-4 border-t border-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-2">Supported Features</p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.supported_features.map((f) => (
                      <span key={f} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{f.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Health Tab */}
          {tab === 'health' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-sm text-gray-900">Recent Health Checks</h3>
              </div>
              {recentChecks.length === 0 ? (
                <p className="text-sm text-gray-400">No health checks recorded yet. Run a connection test to see results.</p>
              ) : (
                <div className="space-y-2">
                  {recentChecks.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${HEALTH_COLORS[c.health_status as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.unknown}`} />
                        <span className="text-sm font-medium text-gray-900">{HEALTH_LABELS[c.health_status as keyof typeof HEALTH_LABELS] ?? c.health_status}</span>
                        {c.response_time_ms != null && <span className="text-xs text-gray-400">{c.response_time_ms}ms</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{new Date(c.checked_at).toLocaleString()}</p>
                        {c.error_message && <p className="text-xs text-red-500 truncate max-w-[200px]">{c.error_message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Webhooks Tab */}
          {tab === 'webhooks' && (
            <WebhooksTab provider={provider} adminId={user?.id} />
          )}

          {/* Logs Tab */}
          {tab === 'logs' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-sm text-gray-900">Recent Audit Events</h3>
              </div>
              {recentLogs.length === 0 ? (
                <p className="text-sm text-gray-400">No audit events recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{LOG_ACTION_LABELS[log.action] ?? log.action}</p>
                        <p className="text-xs text-gray-400">{log.admin?.email ?? 'System'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${log.result === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {log.result}
                        </span>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WebhooksTab({ provider, adminId }: { provider: IntegrationProvider; adminId?: string }) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [events, setEvents] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { error } = await supabase.from('integration_webhooks').upsert({
        provider_id: provider.id,
        webhook_url: webhookUrl || null,
        callback_url: callbackUrl || null,
        webhook_secret: webhookSecret || null,
        expected_events: events ? events.split(',').map((e) => e.trim()) : [],
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider_id' });
      if (error) throw error;
      const { logProviderEvent } = await import('../../lib/integrationHooks');
      await logProviderEvent({
        provider_id: provider.id,
        provider_key: provider.provider_key,
        admin_id: adminId,
        action: 'webhook_updated',
      });
      setMsg('Webhook configuration saved');
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Webhook className="w-5 h-5 text-gray-400" />
        <h3 className="font-semibold text-sm text-gray-900">Webhook Configuration</h3>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Webhook URL</label>
        <input type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://api.dright.co/webhooks/..."
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Callback URL</label>
        <input type="text" value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://..."
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Webhook Secret</label>
        <input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="••••••••"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Expected Events (comma-separated)</label>
        <input type="text" value={events} onChange={(e) => setEvents(e.target.value)} placeholder="payment.success, payment.failed"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      {msg && <div className={`text-sm p-2 rounded-xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{msg}</div>}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Webhook
      </button>
    </div>
  );
}
