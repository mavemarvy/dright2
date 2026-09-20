import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Search, X, CornerDownRight } from 'lucide-react';
import {
  fetchMarketplaceCategoryTree,
  getCategoryPath,
  marketplaceTaxonomyLevelLabel,
  type MarketplaceCategoryTreeNode,
  type MarketplaceListingTypeCode,
} from '../../lib/listingEngine';

const CATEGORY_SEARCH_ALIASES: Record<string, string[]> = {
  phone: ['smartphone', 'mobile', 'cell phone'],
  iphone: ['smartphone', 'phone', 'mobile'],
  android: ['smartphone', 'phone', 'mobile'],
  notebook: ['laptop'],
  sneakers: ['shoes'],
  trainers: ['shoes'],
  purse: ['handbag', 'bags'],
  cv: ['resume'],
  resume: ['cv'],
  va: ['virtual assistant'],
  accountant: ['accounting', 'bookkeeping'],
  bookkeeping: ['accounting'],
  cleaner: ['cleaning'],
  handyman: ['home repair', 'local assistance'],
  plumber: ['plumbing'],
  electrician: ['electrical'],
  mechanic: ['vehicle repair', 'automotive'],
  logo: ['logo design', 'branding'],
  social: ['social media'],
  ads: ['advertising', 'paid media'],
  youtube: ['youtube automation', 'video editing'],
  coding: ['programming', 'development'],
  programmer: ['programming', 'software engineering'],
  developer: ['development', 'software engineering'],
  delivery: ['courier', 'errands', 'logistics'],
  driver: ['delivery driver', 'logistics'],
  tutor: ['tutoring', 'education'],
  teacher: ['education', 'training'],
  graphics: ['graphic design'],
  ui: ['ui & ux design', 'product design'],
  ux: ['ui & ux design', 'product design'],
  seo: ['search engine optimization'],
  ai: ['artificial intelligence', 'machine learning', 'generative ai'],
};

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function expandedSearchTerms(query: string): string[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const terms = new Set<string>([normalized]);
  for (const token of normalized.split(' ')) {
    for (const alias of CATEGORY_SEARCH_ALIASES[token] ?? []) {
      terms.add(normalizeSearch(alias));
    }
  }
  return [...terms].filter(Boolean);
}

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
  const [searchQuery, setSearchQuery] = useState('');

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

  const searchResults = useMemo(() => {
    const terms = expandedSearchTerms(searchQuery);
    if (terms.length === 0) return [];

    return tree
      .map(node => {
        const name = normalizeSearch(node.name);
        const pathText = normalizeSearch(node.path_names.join(' '));
        const aliasText = normalizeSearch((node.synonyms ?? []).join(' '));
        let score = Number.POSITIVE_INFINITY;

        for (const term of terms) {
          if (name === term) score = Math.min(score, 0);
          else if (name.startsWith(term)) score = Math.min(score, 1);
          else if (name.includes(term)) score = Math.min(score, 2);
          else if (aliasText.includes(term)) score = Math.min(score, 2.25);
          else if (pathText.includes(term)) score = Math.min(score, 3);
        }

        if (!Number.isFinite(score)) return null;

        return {
          node,
          score: score + (node.is_leaf ? 0 : 0.35) - Math.min(node.depth, 4) * 0.03,
        };
      })
      .filter((item): item is { node: MarketplaceCategoryTreeNode; score: number } => Boolean(item))
      .sort((a, b) =>
        a.score - b.score
        || Number(b.node.is_leaf) - Number(a.node.is_leaf)
        || a.node.path_names.length - b.node.path_names.length
        || a.node.name.localeCompare(b.node.name)
      )
      .slice(0, 12);
  }, [tree, searchQuery]);

  const fallbackCategory = useMemo(
    () => tree.find(node =>
      node.parent_id === null
      && ['other', 'other-miscellaneous', 'general'].includes(node.slug)
    ) ?? null,
    [tree],
  );

  const selectSearchResult = (node: MarketplaceCategoryTreeNode) => {
    onChange(node.id, getCategoryPath(tree, node.id));
    setSearchQuery('');
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

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          disabled={disabled || loading}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="Search what you want to list — e.g. phone repair, logo design, laptop"
          className="w-full rounded-xl border border-gray-200 pl-10 pr-10 py-3 text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:bg-gray-100"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Clear category search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {searchQuery.trim() && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {searchResults.length > 0 ? (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {searchResults.map(({ node }) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectSearchResult(node)}
                  className="w-full text-left px-3.5 py-3 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <CornerDownRight className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{node.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {node.path_names.join(' › ')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm font-medium text-gray-700">No exact category found.</p>
              <p className="text-xs text-gray-500 mt-1">
                Try a broader word, browse the category levels below, or use the fallback category.
              </p>
              {fallbackCategory && (
                <button
                  type="button"
                  onClick={() => selectSearchResult(fallbackCategory)}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold"
                >
                  Use {fallbackCategory.name}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
              {marketplaceTaxonomyLevelLabel(depth)}
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
          A more specific category is available. Continue toward the most specific Leaf Category when possible.
        </p>
      )}

      {!selectedCategoryId && fallbackCategory && !searchQuery.trim() && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 px-3 py-2.5">
          <p className="text-xs text-gray-500">
            Can't find the exact category? You can still continue with {fallbackCategory.name}.
          </p>
          <button
            type="button"
            onClick={() => selectSearchResult(fallbackCategory)}
            className="shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Select
          </button>
        </div>
      )}
    </div>
  );
}
