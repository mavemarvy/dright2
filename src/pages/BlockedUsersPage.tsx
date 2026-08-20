import { X, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserBlocks } from '../lib/chatPart3Hooks';

export default function BlockedUsersPage() {
  const { user } = useAuth();
  const { blocks, unblockUser } = useUserBlocks(user?.id || null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Blocked Users</h1>
          <p className="text-sm text-gray-500">Manage users you've blocked from messaging you</p>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <Shield className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No blocked users</p>
          <p className="text-gray-400 text-sm mt-1">Users you block will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map(block => (
            <div key={block.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
              {block.blocked_avatar ? (
                <img src={block.blocked_avatar} alt={block.blocked_name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-400">{(block.blocked_name || '?')[0].toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{block.blocked_name}</p>
                <p className="text-xs text-gray-400">Blocked {new Date(block.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => unblockUser(block.blocked_id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
