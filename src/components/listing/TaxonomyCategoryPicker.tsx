import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import {
  fetchMarketplaceCategoryTree,
  getCategoryPath,
  type MarketplaceCategoryTreeNode,
  type MarketplaceListingTypeCode,
} from '../../lib/listingEngine';

interface Props {
  listingTypeCode: MarketplaceListingTypeCode;
  selectedCategoryId: string | null;
  onChange: (
    categoryId: string | null,
    path: MarketplaceCategoryTreeNode[],
  ) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function TaxonomyCategoryPicker({
  listingTypeCode,
  selectedCategoryId,
  onChange,
  label = 'Category',
  disabled = false,
  compact = false,
}: Props) {
  const [tree, setTree] = useState<MarketplaceCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketplaceCategoryTree(listingTypeCode)
      .then(data => {
        if (!active) return;
        setTree(data);
        if (selectedCategoryId && !data.some(node => node.id === selectedCategoryId)) {
          onChange(null, []);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingTypeCode]);

  const path = useMemo(
    () => getCategoryPath(tree, selectedCategoryId),
    [tree, selectedCategoryId],
  );

  const levels = useMemo(() => {
    const result: Array<{
      parentId: string | null;
      selectedId: string;
      options: MarketplaceCategoryTreeNode[];
    }> = [];

    let parentId: string | null = null;
    let depth = 0;

    while (depth < 8) {
      const options = tree
        .filter(node => node.parent_id === parentId)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

      if (options.length === 0) break;

      const selectedAtDepth = path[depth]?.id ?? '';
      result.push({ parentId, selectedId: selectedAtDepth, options });

      if (!selectedAtDepth) break;
      parentId = selectedAtDepth;
      depth += 1;
    }

    return result;
  }, [tree, path]);

  const handleLevelChange = (depth: number, categoryId: string) => {
    if (!categoryId) {
      const parent = depth > 0 ? path[depth - 1] : null;
      onChange(parent?.id ?? null, parent ? path.slice(0, depth) : []);
      return;
    }

    const node = tree.find(item => item.id === categoryId);
    if (!node) return;
    onChange(node.id, getCategoryPath(tree, node.id));
  };

  const selected = selectedCategoryId
    ? tree.find(node => node.id === selectedCategoryId) ?? null
    : null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {path.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {path.map((node, index) => (
            <span key={node.id} className="inline-flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              <span className={index === path.length - 1 ? 'font-semibold text-primary-700' : ''}>
                {node.name}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className={compact ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        {levels.map((level, depth) => (
          <div key={`${level.parentId ?? 'root'}-${depth}`}>
            <label className="block text-xs text-gray-500 mb-1">
              {depth === 0 ? 'Main category' : `Level ${depth + 1}`}
            </label>
            <select
              value={level.selectedId}
              disabled={disabled || loading}
              onChange={event => handleLevelChange(depth, event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:bg-gray-100"
            >
              <option value="">{depth === 0 ? 'Select category' : 'Choose a more specific category'}</option>
              {level.options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!loading && tree.length === 0 && (
        <p className="text-xs text-gray-500">
          No taxonomy categories are configured for this listing type yet.
        </p>
      )}

      {selected?.has_children && (
        <p className="text-xs text-amber-600">
          A more specific category is available. Choosing the closest match improves search and filtering.
        </p>
      )}
    </div>
  );
}
