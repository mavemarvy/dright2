import { Loader2, Camera, Image, HardDrive, Bell, MapPin, Mic, Shield } from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { usePermissionInfo } from '../lib/contentHooks';
import { PERMISSION_TYPES } from '../lib/contentTypes';

const ICON_MAP: Record<string, typeof Camera> = {
  camera: Camera, gallery: Image, storage: HardDrive, notifications: Bell, location: MapPin, microphone: Mic,
};

export default function PermissionsPage() {
  const { permissions, loading } = usePermissionInfo();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="App Permissions" description="Learn how DRIGHT uses device permissions." canonical="/permissions" />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">App Permissions</h1>
            <p className="text-gray-500 text-sm">Learn how DRIGHT uses each permission on your device</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
        ) : permissions.length === 0 ? (
          <p className="text-gray-400">No permission information available.</p>
        ) : (
          <div className="space-y-4">
            {permissions.map(perm => {
              const Icon = ICON_MAP[perm.permission_type] || Shield;
              const typeInfo = PERMISSION_TYPES.find(t => t.value === perm.permission_type);
              return (
                <div key={perm.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${perm.is_enabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <Icon className={`w-6 h-6 ${perm.is_enabled ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{perm.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${perm.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {perm.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{perm.description}</p>
                      {perm.image_url && <img src={perm.image_url} alt={perm.title} className="mt-3 rounded-xl max-h-48 object-cover" />}
                      {typeInfo && <p className="text-xs text-gray-400 mt-3">Permission type: {typeInfo.label}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
