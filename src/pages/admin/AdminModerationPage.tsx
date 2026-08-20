import { useState } from 'react';
import {
  Shield, Loader2, CheckCircle2, XCircle, Eye, Archive, Flag,
} from 'lucide-react';
import { useModerationQueue } from '../../lib/adminIntelligenceHooks';
import { updateModerationItem, logAdminAction } from '../../lib/adminIntelligence';

export default function AdminModerationPage() {
  const { items, loading, refetch } = useModerationQueue();
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const handleAction = async (id: string, status: string, itemType: string, itemId: string) => {
    await updateModerationItem(id, { status, resolution_notes: `Action: ${status}` });
    await logAdminAction('moderation_action', itemType, itemId, { status });
    refetch();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Moderation Center</h1>
          <p className="text-sm text-gray-500">Review and moderate marketplace content</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'pending', 'approved', 'rejected', 'hidden', 'flagged'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors capitalize ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No items in queue</p>
          <p className="text-sm text-gray-400 mt-1">All clear!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      item.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                      item.status === 'approved' ? 'bg-green-50 text-green-600' :
                      item.status === 'rejected' ? 'bg-red-50 text-red-500' :
                      'bg-gray-100 text-gray-600'
                    }`}>{item.status}</span>
                    <span className="text-xs text-gray-400 capitalize">{item.item_type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">Item: {item.item_id.slice(0, 8)}</p>
                  {item.reason && <p className="text-xs text-gray-500 mt-1">{item.reason}</p>}
                  <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                {item.status === 'pending' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleAction(item.id, 'approved', item.item_type, item.item_id)} title="Approve" className="p-2 text-green-500 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(item.id, 'rejected', item.item_type, item.item_id)} title="Reject" className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                      <XCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(item.id, 'hidden', item.item_type, item.item_id)} title="Hide" className="p-2 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(item.id, 'flagged', item.item_type, item.item_id)} title="Flag" className="p-2 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors">
                      <Flag className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleAction(item.id, 'archived', item.item_type, item.item_id)} title="Archive" className="p-2 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
