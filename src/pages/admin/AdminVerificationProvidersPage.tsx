import { useState } from 'react';
import { useKycProviders, useKycProviderSettings, updateKycProviderSetting, setActiveKycProvider, testKycConnection } from '../../lib/kycHooks';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Shield, Check, X, Zap, Activity, Settings, AlertTriangle } from 'lucide-react';

export default function AdminVerificationProvidersPage() {
  const { providers, loading: providersLoading } = useKycProviders();
  const { settings, loading: settingsLoading, refetch } = useKycProviderSettings();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ api_key: '', secret_key: '', webhook_secret: '', mode: 'sandbox' as 'sandbox' | 'production' });

  const getSetting = (providerId: string) => settings.find((s) => s.provider_id === providerId);

  const handleToggle = async (providerId: string, field: 'is_enabled' | 'is_connected', current: boolean) => {
    setError(null);
    try {
      const setting = getSetting(providerId);
      if (!setting) return;
      await updateKycProviderSetting(setting.id, { [field]: !current } as Record<string, unknown>);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };

  const handleSwitchProvider = async (providerId: string) => {
    setError(null);
    try {
      await setActiveKycProvider(providerId);
      setSuccess('Active verification provider switched');
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Switch failed'); }
  };

  const handleTest = async (providerId: string) => {
    setTestingId(providerId);
    setError(null);
    try {
      const result = await testKycConnection(providerId);
      setSuccess(result.message);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Test failed'); }
    setTestingId(null);
  };

  const openEdit = (providerId: string) => {
    const s = getSetting(providerId);
    setEditForm({
      api_key: s?.api_key ?? '', secret_key: s?.secret_key ?? '',
      webhook_secret: s?.webhook_secret ?? '', mode: s?.mode ?? 'sandbox',
    });
    setEditingId(providerId);
  };

  const handleSaveSettings = async (providerId: string) => {
    setError(null);
    try {
      const setting = getSetting(providerId);
      if (!setting) return;
      await updateKycProviderSetting(setting.id, {
        api_key: editForm.api_key || null,
        secret_key: editForm.secret_key || null,
        webhook_secret: editForm.webhook_secret || null,
        mode: editForm.mode,
      });
      setSuccess('Provider settings saved');
      setEditingId(null);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  const loading = providersLoading || settingsLoading;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Verification Providers" subtitle="Configure KYC providers, switch between manual and automated verification" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex items-center justify-between"><span>{success}</span><button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button></div>}
      {loading && <LoadingBar />}

      {/* Active Provider Selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-1">Verification Mode</h3>
        <p className="text-sm text-gray-500 mb-4">Select the active verification provider. Only one provider can be active at a time.</p>
        <div className="space-y-2">
          {providers.map((p) => {
            const setting = getSetting(p.id);
            const isActive = setting?.is_active ?? false;
            const isManual = p.slug === 'manual';
            return (
              <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${isActive ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <input type="radio" name="active-provider" checked={isActive} onChange={() => handleSwitchProvider(p.id)} disabled={!isManual && !setting?.is_connected}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">{p.display_name ?? p.name}</span>
                    {p.provider_type === 'automated' && <span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-200">Automated</span>}
                    {p.is_system && <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-50 text-gray-500 border border-gray-200">System</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>
                </div>
                {!isManual && !setting?.is_connected && <span className="text-xs text-amber-500">Not Connected</span>}
              </label>
            );
          })}
        </div>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => {
          const setting = getSetting(p.id);
          if (!setting) return null;
          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><Shield className="w-5 h-5 text-primary-500" /></div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{p.display_name ?? p.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{p.provider_type}</p>
                  </div>
                </div>
                {setting.is_active && <span className="px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Active</span>}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Connected</span>
                  {setting.is_connected ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Enabled</span>
                  <button onClick={() => handleToggle(p.id, 'is_enabled', setting.is_enabled)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${setting.is_enabled ? 'bg-primary-500' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${setting.is_enabled ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Mode</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${setting.mode === 'production' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{setting.mode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Health</span>
                  <span className={`flex items-center gap-1 ${setting.health_status === 'healthy' ? 'text-green-600' : setting.health_status === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                    <Activity className="w-3 h-3" /> {setting.health_status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Last Sync</span>
                  <span className="text-gray-400">{setting.last_sync_at ? new Date(setting.last_sync_at).toLocaleDateString() : 'Never'}</span>
                </div>
                {setting.last_error && (
                  <div className="flex items-start gap-1 text-red-500">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="text-xs">{setting.last_error}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-1.5 mt-4">
                <button onClick={() => handleTest(p.id)} disabled={testingId === p.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                  <Zap className="w-3 h-3" /> {testingId === p.id ? 'Testing...' : 'Test'}
                </button>
                <button onClick={() => openEdit(p.id)}
                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Settings className="w-3 h-3" /> Settings
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settings Dialog */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingId(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Provider Settings</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">API Key</label>
                <input type="password" value={editForm.api_key} onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Secret Key</label>
                <input type="password" value={editForm.secret_key} onChange={(e) => setEditForm({ ...editForm, secret_key: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Webhook Secret</label>
                <input type="password" value={editForm.webhook_secret} onChange={(e) => setEditForm({ ...editForm, webhook_secret: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mode</label>
                <select value={editForm.mode} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value as 'sandbox' | 'production' })}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={() => handleSaveSettings(editingId)} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
