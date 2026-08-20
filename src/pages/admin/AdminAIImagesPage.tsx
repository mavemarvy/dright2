import { useState } from 'react';
import {
  Image, Loader2, CheckCircle2, XCircle, Flag, Trash2, Eye,
} from 'lucide-react';
import { useAllImages } from '../../lib/ai/imageHooks';
import type { AIImageRecord } from '../../lib/ai/imageGenerator';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-50 text-green-600',
  pending: 'bg-amber-50 text-amber-600',
  failed: 'bg-red-50 text-red-500',
  flagged: 'bg-orange-50 text-orange-600',
  removed: 'bg-gray-100 text-gray-500',
};

const TYPE_LABELS: Record<string, string> = {
  generated: 'Generated',
  edited: 'Edited',
  analyzed: 'Analyzed',
  banner: 'Banner',
  marketing: 'Marketing',
  product: 'Product',
  background_removed: 'BG Removed',
  enhanced: 'Enhanced',
};

export default function AdminAIImagesPage() {
  const { images, loading, moderate, remove } = useAllImages(100);
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AIImageRecord | null>(null);

  const filtered = filter === 'all' ? images : images.filter((i) => i.status === filter);

  const handleModerate = async (imageId: string, status: string) => {
    await moderate(imageId, status);
    setSelected(null);
  };

  const handleRemove = async (imageId: string) => {
    await remove(imageId);
    setSelected(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
          <Image className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Image Moderation</h1>
          <p className="text-sm text-gray-500">Review and moderate AI-generated images</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'completed', 'pending', 'failed', 'flagged', 'removed'].map((f) => (
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No AI images found</p>
          <p className="text-sm text-gray-400 mt-1">Images will appear here when users generate them</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((img) => (
            <div key={img.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {img.image_url ? (
                <div className="aspect-video bg-gray-50 flex items-center justify-center overflow-hidden">
                  <img
                    src={img.image_url}
                    alt={img.prompt}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center">
                  <Image className="w-8 h-8 text-purple-300" />
                </div>
              )}

              <div className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[img.status] || 'bg-gray-100 text-gray-600'}`}>
                    {img.status}
                  </span>
                  <span className="text-xs text-gray-400">{TYPE_LABELS[img.type] || img.type}</span>
                  <span className="text-xs text-gray-400">{img.provider}</span>
                </div>

                <p className="text-sm text-gray-700 line-clamp-2 mb-2">{img.prompt || 'No prompt'}</p>
                <p className="text-xs text-gray-400 mb-3">
                  {new Date(img.created_at).toLocaleDateString()} by {img.user_id.slice(0, 8)}
                </p>

                <div className="flex items-center gap-1">
                  <button onClick={() => setSelected(img)} title="View details" className="p-2 text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  {img.status !== 'flagged' && (
                    <button onClick={() => handleModerate(img.id, 'flagged')} title="Flag" className="p-2 text-orange-500 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors">
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                  {img.status === 'flagged' && (
                    <button onClick={() => handleModerate(img.id, 'completed')} title="Approve" className="p-2 text-green-500 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleModerate(img.id, 'removed')} title="Remove" className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleRemove(img.id)} title="Delete permanently" className="p-2 text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Image Details</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {selected.image_url && (
              <img src={selected.image_url} alt={selected.prompt} className="w-full rounded-xl mb-4 max-h-64 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}

            <dl className="space-y-2 text-sm">
              <div><dt className="font-semibold text-gray-700">Prompt</dt><dd className="text-gray-600">{selected.prompt || 'N/A'}</dd></div>
              <div><dt className="font-semibold text-gray-700">Type</dt><dd className="text-gray-600">{selected.type}</dd></div>
              <div><dt className="font-semibold text-gray-700">Provider</dt><dd className="text-gray-600">{selected.provider} ({selected.model})</dd></div>
              <div><dt className="font-semibold text-gray-700">Status</dt><dd className="text-gray-600">{selected.status}</dd></div>
              <div><dt className="font-semibold text-gray-700">Created</dt><dd className="text-gray-600">{new Date(selected.created_at).toLocaleString()}</dd></div>
              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div><dt className="font-semibold text-gray-700">Metadata</dt><dd className="text-gray-600 text-xs"><pre className="bg-gray-50 rounded-lg p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre></dd></div>
              )}
            </dl>

            <div className="flex items-center gap-2 mt-6">
              <button onClick={() => handleModerate(selected.id, 'completed')} className="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-medium hover:bg-green-100 transition-colors">
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => handleModerate(selected.id, 'flagged')} className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors">
                <Flag className="w-4 h-4" /> Flag
              </button>
              <button onClick={() => handleModerate(selected.id, 'removed')} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-500 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                <XCircle className="w-4 h-4" /> Remove
              </button>
              <button onClick={() => handleRemove(selected.id)} className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
