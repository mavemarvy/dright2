import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, Edit3, Eye, EyeOff, FolderTree, Loader2, Plus, RotateCcw, Save,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { MarketplaceListingTypeCode } from '../../lib/listingEngine';

interface AdminTaxonomyNode {
  id: string;
  listing_type_code: MarketplaceListingTypeCode;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_leaf: boolean;
  is_active: boolean;
  depth: number;
  path_ids: string[];
  path_names: string[];
  has_children: boolean;
}

const LISTING_TYPES: Array<{ code: MarketplaceListingTypeCode; label: string }> = [
  { code: 'PHYSICAL', label: 'Physical Products' },
  { code: 'DIGITAL', label: 'Digital Products' },
  { code: 'SERVICE', label: 'Services' },
  { code: 'COURSE', label: 'Courses' },
  { code: 'JOB', label: 'Jobs' },
  { code: 'TASK', label: 'Tasks' },
];

export default function AdminTaxonomyManager() {
  const [listingType, setListingType] = useState<MarketplaceListingTypeCode>('PHYSICAL');
  const [nodes, setNodes] = useState<AdminTaxonomyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState(100);
  const [isLeaf, setIsLeaf] = useState(true);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_get_marketplace_taxonomy_tree', {
      p_listing_type_code: listingType,
    });

    if (rpcError) {
      setError(rpcError.message);
      setNodes([]);
    } else {
      setNodes((data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        listing_type_code: row.listing_type_code as MarketplaceListingTypeCode,
        parent_id: row.parent_id ? String(row.parent_id) : null,
        name: String(row.name),
        slug: String(row.slug),
        description: row.description ?? null,
        icon: row.icon ?? null,
        image_url: row.image_url ?? null,
        sort_order: Number(row.sort_order ?? 100),
        is_leaf: Boolean(row.is_leaf),
        is_active: Boolean(row.is_active),
        depth: Number(row.depth ?? 0),
        path_ids: Array.isArray(row.path_ids) ? row.path_ids.map(String) : [],
        path_names: Array.isArray(row.path_names) ? row.path_names.map(String) : [],
        has_children: Boolean(row.has_children),
      })) as AdminTaxonomyNode[]);
    }
    setLoading(false);
  }, [listingType]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const editingNode = useMemo(
    () => nodes.find(node => node.id === editingId) ?? null,
    [editingId, nodes],
  );

  const resetForm = () => {
    setEditingId(null);
    setParentId('');
    setName('');
    setSlug('');
    setSortOrder(100);
    setIsLeaf(true);
  };

  const beginEdit = (node: AdminTaxonomyNode) => {
    setEditingId(node.id);
    setParentId(node.parent_id ?? '');
    setName(node.name);
    setSlug(node.slug);
    setSortOrder(node.sort_order);
    setIsLeaf(node.is_leaf);
    setError(null);
  };

  const saveCategory = async () => {
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_upsert_marketplace_taxonomy_category', {
      p_id: editingId || null,
      p_listing_type_code: listingType,
      p_parent_id: parentId || null,
      p_name: name.trim(),
      p_slug: slug.trim() || null,
      p_description: editingNode?.description ?? null,
      p_icon: editingNode?.icon ?? null,
      p_image_url: editingNode?.image_url ?? null,
      p_sort_order: sortOrder,
      p_is_leaf: isLeaf,
      p_is_active: editingNode?.is_active ?? true,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      resetForm();
      await loadTree();
    }
    setSaving(false);
  };

  const toggleActive = async (node: AdminTaxonomyNode) => {
    setSavingId(node.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_marketplace_taxonomy_category_active', {
      p_category_id: node.id,
      p_is_active: !node.is_active,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadTree();
    }
    setSavingId(null);
  };

  const parentOptions = nodes.filter(node => {
    if (!editingId) return true;
    if (node.id === editingId) return false;
    return !node.path_ids.includes(editingId);
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-primary-600" />
            Taxonomy Tree
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Build nested categories without changing legacy listing tables.
          </p>
        </div>
        <select
          value={listingType}
          onChange={event => {
            setListingType(event.target.value as MarketplaceListingTypeCode);
            resetForm();
          }}
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
        >
          {LISTING_TYPES.map(type => (
            <option key={type.code} value={type.code}>{type.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {editingId ? 'Edit Category' : 'Add Category'}
            </p>
            <p className="text-xs text-gray-500">
              A blank parent creates a root category. Existing descendants are cycle-protected by the database.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-600"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Parent</span>
            <select
              value={parentId}
              onChange={event => setParentId(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Root category</option>
              {parentOptions.map(node => (
                <option key={node.id} value={node.id}>
                  {'— '.repeat(Math.min(node.depth, 4))}{node.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Name</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. Smartphones"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Slug (optional)</span>
            <input
              value={slug}
              onChange={event => setSlug(event.target.value)}
              placeholder="auto-generated"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Sort order</span>
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={event => setSortOrder(Number(event.target.value))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isLeaf}
              onChange={event => setIsLeaf(event.target.checked)}
            />
            Final/leaf category
          </label>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void saveCategory()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : editingId
                ? <Save className="w-4 h-4" />
                : <Plus className="w-4 h-4" />}
            {editingId ? 'Save Category' : 'Add Category'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">
            {LISTING_TYPES.find(type => type.code === listingType)?.label} ({nodes.length})
          </p>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        <div className="divide-y divide-gray-100 max-h-[540px] overflow-y-auto">
          {!loading && nodes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No taxonomy categories yet.</p>
          )}
          {nodes.map(node => (
            <div
              key={node.id}
              className={`flex items-center gap-3 px-4 py-3 ${node.is_active ? 'bg-white' : 'bg-gray-50 opacity-65'}`}
            >
              <div
                className="flex-1 min-w-0"
                style={{ paddingLeft: Math.min(node.depth, 6) * 16 }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {node.depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                  <p className="text-sm font-semibold text-gray-800 truncate">{node.name}</p>
                  {node.is_leaf && (
                    <span className="text-[10px] rounded-full bg-primary-50 text-primary-700 px-1.5 py-0.5 shrink-0">
                      leaf
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {node.path_names.join(' › ')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => beginEdit(node)}
                className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                aria-label={`Edit ${node.name}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={savingId === node.id}
                onClick={() => void toggleActive(node)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                  node.is_active
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {savingId === node.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : node.is_active
                    ? <Eye className="w-3.5 h-3.5" />
                    : <EyeOff className="w-3.5 h-3.5" />}
                {node.is_active ? 'Active' : 'Hidden'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
