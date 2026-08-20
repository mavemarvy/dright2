import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Eye, EyeOff, Copy, X, Save, ChevronUp, ChevronDown,
  Image as ImageIcon, BarChart3, Link2, Calendar, Users, DollarSign,
  Layers, ArrowRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  useAllBanners, useAllBannerAnalytics, useBannerLinks,
  createBanner, updateBanner, duplicateBanner, softDeleteBanner, reorderBanners,
  upsertBannerLink, deleteBannerLink,
} from '../../lib/bannerHooks';
import {
  BANNER_STATUSES, BANNER_TYPES, BUTTON_STYLES, TARGET_AUDIENCES,
  DESTINATION_TYPES, PAYMENT_STATUSES,
} from '../../lib/bannerTypes';
import type {
  MarketplaceBanner, BannerInput, BannerStatus, BannerType, ButtonStyle,
  TargetAudience, DestinationType, PaymentStatus, BannerLink,
} from '../../lib/bannerTypes';

type Tab = 'list' | 'editor' | 'analytics';

export default function AdminBannerPage() {
  const { user } = useAuth();
  const { banners, loading, refetch } = useAllBanners();
  const { summaries } = useAllBannerAnalytics();
  const [tab, setTab] = useState<Tab>('list');
  const [editingBanner, setEditingBanner] = useState<MarketplaceBanner | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const handleCreate = () => {
    setEditingBanner(null);
    setShowEditor(true);
    setTab('editor');
  };

  const handleEdit = (banner: MarketplaceBanner) => {
    setEditingBanner(banner);
    setShowEditor(true);
    setTab('editor');
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateBanner(id);
      refetch();
    } catch (e) {
      console.error('Duplicate failed:', e);
    }
  };

  const handleToggleStatus = async (banner: MarketplaceBanner) => {
    const newStatus: BannerStatus = banner.status === 'active' ? 'disabled' : 'active';
    try {
      await updateBanner(banner.id, { status: newStatus });
      refetch();
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await softDeleteBanner(id);
      refetch();
    } catch (e) {
      console.error('Archive failed:', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this banner? This cannot be undone.')) return;
    try {
      await supabase.from('promotional_banners').delete().eq('id', id);
      refetch();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleReorder = async (bannerId: string, direction: 'up' | 'down') => {
    const sorted = [...banners].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(b => b.id === bannerId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const ids = sorted.map(b => b.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    await reorderBanners(ids);
    refetch();
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Banner Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create, schedule, and monitor marketplace banners</p>
        </div>
        <button onClick={handleCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Banner
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([
          { key: 'list', label: 'All Banners', icon: Layers },
          { key: 'editor', label: 'Editor', icon: Edit2 },
          { key: 'analytics', label: 'Analytics', icon: BarChart3 },
        ] as { key: Tab; label: string; icon: typeof Layers }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <BannerList
          banners={banners}
          loading={loading}
          summaries={summaries}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onToggle={handleToggleStatus}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      )}

      {tab === 'editor' && showEditor && (
        <BannerEditor
          banner={editingBanner}
          userId={user?.id || ''}
          onClose={() => { setShowEditor(false); setTab('list'); }}
          onSaved={() => { setShowEditor(false); setTab('list'); refetch(); }}
        />
      )}

      {tab === 'editor' && !showEditor && (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          <Edit2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Click "New Banner" to create a banner, or edit an existing one from the list.</p>
        </div>
      )}

      {tab === 'analytics' && (
        <BannerAnalytics banners={banners} summaries={summaries} loading={loading} />
      )}
    </div>
  );
}

// ============================================================
// BANNER LIST
// ============================================================

function BannerList({
  banners, loading, summaries, onEdit, onDuplicate, onToggle, onArchive, onDelete, onReorder,
}: {
  banners: MarketplaceBanner[];
  loading: boolean;
  summaries: Record<string, { impressions: number; clicks: number; conversions: number; ctr: number }>;
  onEdit: (b: MarketplaceBanner) => void;
  onDuplicate: (id: string) => void;
  onToggle: (b: MarketplaceBanner) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, dir: 'up' | 'down') => void;
}) {
  if (loading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => (
      <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
    ))}</div>;
  }

  if (banners.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No banners yet</p>
        <p className="text-sm mt-1">Create your first marketplace banner to get started.</p>
      </div>
    );
  }

  const sorted = [...banners].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  return (
    <div className="space-y-3">
      {sorted.map((banner, idx) => {
        const analytics = summaries[banner.id];
        const statusConfig = BANNER_STATUSES.find(s => s.value === banner.status);
        const typeConfig = BANNER_TYPES.find(t => t.value === banner.banner_type);
        const img = banner.desktop_image || banner.mobile_image || banner.media_url;

        return (
          <div key={banner.id}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
            {/* Thumbnail */}
            <div className="w-24 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
              {img ? <img src={img} alt={banner.title} className="w-full h-full object-cover" /> :
                <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-400" /></div>}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{banner.title}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig?.color || 'text-gray-500'} bg-gray-100 dark:bg-gray-700`}>
                  {statusConfig?.label || banner.status}
                </span>
                <span className="text-xs text-gray-400 hidden md:inline">{typeConfig?.label}</span>
              </div>
              {banner.subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{banner.subtitle}</p>}
              {analytics && (
                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                  <span>{analytics.impressions} views</span>
                  <span>{analytics.clicks} clicks</span>
                  <span>{analytics.ctr.toFixed(1)}% CTR</span>
                  {analytics.conversions > 0 && <span className="text-green-600">{analytics.conversions} conversions</span>}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onReorder(banner.id, 'up')} disabled={idx === 0}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors" title="Move up">
                <ChevronUp className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => onReorder(banner.id, 'down')} disabled={idx === sorted.length - 1}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors" title="Move down">
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => onToggle(banner)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={banner.status === 'active' ? 'Disable' : 'Activate'}>
                {banner.status === 'active' ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
              </button>
              <button onClick={() => onEdit(banner)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Edit">
                <Edit2 className="w-4 h-4 text-blue-600" />
              </button>
              <button onClick={() => onDuplicate(banner.id)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Duplicate">
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => onArchive(banner.id)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Archive">
                <Layers className="w-4 h-4 text-orange-600" />
              </button>
              <button onClick={() => onDelete(banner.id)}
                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// BANNER EDITOR
// ============================================================

function BannerEditor({
  banner, userId, onClose, onSaved,
}: {
  banner: MarketplaceBanner | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    title: banner?.title || '',
    subtitle: banner?.subtitle || '',
    description: banner?.description || '',
    badge_text: banner?.badge_text || '',
    promotional_message: banner?.promotional_message || '',
    desktop_image: banner?.desktop_image || '',
    tablet_image: banner?.tablet_image || '',
    mobile_image: banner?.mobile_image || '',
    background_image: banner?.background_image || '',
    video_url: banner?.video_url || '',
    button_text: banner?.button_text || '',
    button_link: banner?.button_link || '',
    button_style: banner?.button_style || 'primary',
    button_visible: banner?.button_visible ?? true,
    banner_type: banner?.banner_type || 'platform',
    target_audience: banner?.target_audience || ['all'],
    start_date: banner?.start_date?.slice(0, 16) || '',
    end_date: banner?.end_date?.slice(0, 16) || '',
    status: banner?.status || 'active',
    priority: banner?.priority || 0,
    display_order: banner?.display_order || 0,
    countdown_ends_at: banner?.countdown_ends_at?.slice(0, 16) || '',
    advertiser_name: banner?.advertiser_name || '',
    campaign_id: banner?.campaign_id || '',
    payment_status: banner?.payment_status || 'unpaid',
    campaign_duration: banner?.campaign_duration || '',
    budget: banner?.budget || '',
  });

  const [linkForm, setLinkForm] = useState<{
    destination_type: DestinationType;
    destination_id: string;
    external_url: string;
  }>({
    destination_type: 'product',
    destination_id: '',
    external_url: '',
  });

  const [links, setLinks] = useState<BannerLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSponsored, setShowSponsored] = useState(banner?.banner_type !== 'platform');

  const { links: fetchedLinks, refetch: refetchLinks } = useBannerLinks(banner?.id || null);
  useEffect(() => { if (fetchedLinks) setLinks(fetchedLinks); }, [fetchedLinks]);

  const setField = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleAudience = (aud: TargetAudience) => {
    const current = form.target_audience as TargetAudience[];
    if (current.includes(aud)) {
      setField('target_audience', current.filter(a => a !== aud));
    } else {
      setField('target_audience', [...current, aud]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const input: BannerInput = {
        title: form.title as string,
        subtitle: form.subtitle as string || null,
        description: form.description as string || null,
        badge_text: form.badge_text as string || null,
        promotional_message: form.promotional_message as string || null,
        desktop_image: form.desktop_image as string || null,
        tablet_image: form.tablet_image as string || null,
        mobile_image: form.mobile_image as string || null,
        background_image: form.background_image as string || null,
        video_url: form.video_url as string || null,
        button_text: form.button_text as string || null,
        button_link: form.button_link as string || null,
        button_style: form.button_style as ButtonStyle,
        button_visible: form.button_visible as boolean,
        banner_type: form.banner_type as BannerType,
        target_audience: form.target_audience as TargetAudience[],
        start_date: form.start_date ? new Date(form.start_date as string).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date as string).toISOString() : null,
        status: form.status as BannerStatus,
        priority: Number(form.priority),
        display_order: Number(form.display_order),
        countdown_ends_at: form.countdown_ends_at ? new Date(form.countdown_ends_at as string).toISOString() : null,
        advertiser_name: form.advertiser_name as string || null,
        campaign_id: form.campaign_id as string || null,
        payment_status: form.payment_status as PaymentStatus,
        campaign_duration: form.campaign_duration as string || null,
        budget: form.budget ? Number(form.budget) : null,
      };

      if (banner) {
        await updateBanner(banner.id, input);
      } else {
        const created = await createBanner(input, userId);
        if (created && linkForm.destination_id) {
          await upsertBannerLink(created.id, {
            destination_type: linkForm.destination_type,
            destination_id: linkForm.destination_id,
            external_url: linkForm.external_url,
          });
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save banner');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!banner) return;
    try {
      await upsertBannerLink(banner.id, {
        destination_type: linkForm.destination_type,
        destination_id: linkForm.destination_id || null,
        external_url: linkForm.external_url || null,
      });
      refetchLinks();
      setLinkForm({ destination_type: 'product', destination_id: '', external_url: '' });
    } catch (e) {
      console.error('Link add failed:', e);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await deleteBannerLink(linkId);
      refetchLinks();
    } catch (e) {
      console.error('Link delete failed:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {banner ? 'Edit Banner' : 'New Banner'}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Banner'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Content */}
        <div className="space-y-4">
          <Section icon={Edit2} title="Text Content">
            <TextInput label="Title" value={form.title as string} onChange={v => setField('title', v)} placeholder="e.g. 50% Off AI Courses" />
            <TextInput label="Subtitle" value={form.subtitle as string} onChange={v => setField('subtitle', v)} placeholder="e.g. Limited Time Campaign" />
            <TextArea label="Description" value={form.description as string} onChange={v => setField('description', v)} placeholder="Detailed promotional text..." />
            <TextInput label="Badge Text" value={form.badge_text as string} onChange={v => setField('badge_text', v)} placeholder="e.g. Hot Deal" />
            <TextInput label="Promotional Message" value={form.promotional_message as string} onChange={v => setField('promotional_message', v)} placeholder="e.g. Join thousands of sellers" />
          </Section>

          <Section icon={ImageIcon} title="Visual Content">
            <TextInput label="Desktop Image URL" value={form.desktop_image as string} onChange={v => setField('desktop_image', v)} placeholder="https://..." />
            <TextInput label="Tablet Image URL" value={form.tablet_image as string} onChange={v => setField('tablet_image', v)} placeholder="https://..." />
            <TextInput label="Mobile Image URL" value={form.mobile_image as string} onChange={v => setField('mobile_image', v)} placeholder="https://..." />
            <TextInput label="Background Image URL" value={form.background_image as string} onChange={v => setField('background_image', v)} placeholder="https://..." />
            <TextInput label="Video URL (optional)" value={form.video_url as string} onChange={v => setField('video_url', v)} placeholder="https://..." />
          </Section>

          <Section icon={Link2} title="Button Controls">
            <TextInput label="Button Text" value={form.button_text as string} onChange={v => setField('button_text', v)} placeholder="e.g. Shop Now" />
            <TextInput label="Button Link" value={form.button_link as string} onChange={v => setField('button_link', v)} placeholder="/market or https://..." />
            <SelectInput label="Button Style" value={form.button_style as string} onChange={v => setField('button_style', v)}
              options={BUTTON_STYLES.map(s => ({ value: s.value, label: s.label }))} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.button_visible as boolean} onChange={e => setField('button_visible', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show button</span>
            </label>
          </Section>
        </div>

        {/* Right: Settings */}
        <div className="space-y-4">
          <Section icon={Calendar} title="Scheduling">
            <DateTimeInput label="Start Date & Time" value={form.start_date as string} onChange={v => setField('start_date', v)} />
            <DateTimeInput label="End Date & Time" value={form.end_date as string} onChange={v => setField('end_date', v)} />
            <DateTimeInput label="Countdown Ends At (optional)" value={form.countdown_ends_at as string} onChange={v => setField('countdown_ends_at', v)} />
          </Section>

          <Section icon={Users} title="Audience Targeting">
            <div className="flex flex-wrap gap-2">
              {TARGET_AUDIENCES.map(aud => {
                const selected = (form.target_audience as TargetAudience[]).includes(aud.value);
                return (
                  <button key={aud.value} onClick={() => toggleAudience(aud.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selected ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}>
                    {aud.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section icon={Layers} title="Banner Type & Status">
            <SelectInput label="Banner Type" value={form.banner_type as string} onChange={v => { setField('banner_type', v); setShowSponsored(v !== 'platform'); }}
              options={BANNER_TYPES.map(t => ({ value: t.value, label: t.label }))} />
            <SelectInput label="Status" value={form.status as string} onChange={v => setField('status', v)}
              options={BANNER_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Priority" value={form.priority as number} onChange={v => setField('priority', v)} />
              <NumberInput label="Display Order" value={form.display_order as number} onChange={v => setField('display_order', v)} />
            </div>
          </Section>

          {/* Sponsored fields */}
          {showSponsored && (
            <Section icon={DollarSign} title="Sponsored Campaign">
              <TextInput label="Advertiser Name" value={form.advertiser_name as string} onChange={v => setField('advertiser_name', v)} placeholder="Company or seller name" />
              <TextInput label="Campaign ID" value={form.campaign_id as string} onChange={v => setField('campaign_id', v)} placeholder="Internal campaign reference" />
              <SelectInput label="Payment Status" value={form.payment_status as string} onChange={v => setField('payment_status', v)}
                options={PAYMENT_STATUSES.map(p => ({ value: p.value, label: p.label }))} />
              <TextInput label="Campaign Duration" value={form.campaign_duration as string} onChange={v => setField('campaign_duration', v)} placeholder="e.g. 30 days" />
              <NumberInput label="Budget" value={form.budget as number} onChange={v => setField('budget', v)} />
            </Section>
          )}

          {/* Banner Links */}
          {banner && (
            <Section icon={Link2} title="Banner Links">
              <div className="space-y-2">
                {links.map(link => (
                  <div key={link.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-xs font-medium text-gray-500">{link.destination_type}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                      {link.external_url || link.destination_id || '—'}
                    </span>
                    <button onClick={() => handleDeleteLink(link.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-2 mt-2">
                <div className="flex-1">
                  <SelectInput label="Destination Type" value={linkForm.destination_type} onChange={v => setLinkForm(prev => ({ ...prev, destination_type: v as DestinationType }))}
                    options={DESTINATION_TYPES.map(d => ({ value: d.value, label: d.label }))} />
                </div>
                {linkForm.destination_type === 'external' ? (
                  <div className="flex-1">
                    <TextInput label="External URL" value={linkForm.external_url} onChange={v => setLinkForm(prev => ({ ...prev, external_url: v }))} placeholder="https://..." />
                  </div>
                ) : (
                  <div className="flex-1">
                    <TextInput label="Destination ID / Slug" value={linkForm.destination_id} onChange={v => setLinkForm(prev => ({ ...prev, destination_id: v }))} placeholder="Product ID, slug..." />
                  </div>
                )}
                <button onClick={handleAddLink}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </Section>
          )}

          {/* Canva placeholder */}
          <div className="p-4 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-center">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-500" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Design with Canva</p>
            <p className="text-xs text-gray-400 mt-1">Canva API integration coming soon. Upload images directly for now.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BANNER ANALYTICS
// ============================================================

function BannerAnalytics({
  banners, summaries, loading,
}: {
  banners: MarketplaceBanner[];
  summaries: Record<string, { impressions: number; clicks: number; conversions: number; ctr: number }>;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />;
  }

  const totalImpressions = Object.values(summaries).reduce((s, a) => s + a.impressions, 0);
  const totalClicks = Object.values(summaries).reduce((s, a) => s + a.clicks, 0);
  const totalConversions = Object.values(summaries).reduce((s, a) => s + a.conversions, 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Impressions" value={totalImpressions.toLocaleString()} icon={Eye} color="text-blue-600" />
        <StatCard label="Total Clicks" value={totalClicks.toLocaleString()} icon={ArrowRight} color="text-green-600" />
        <StatCard label="Overall CTR" value={`${overallCtr.toFixed(1)}%`} icon={BarChart3} color="text-purple-600" />
        <StatCard label="Conversions" value={totalConversions.toLocaleString()} icon={Sparkles} color="text-orange-600" />
      </div>

      {/* Per-banner table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Banner Performance</h3>
        </div>
        {banners.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No banners to analyze yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Banner</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Views</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Clicks</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">CTR</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Conversions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {banners.map(banner => {
                  const a = summaries[banner.id] || { impressions: 0, clicks: 0, conversions: 0, ctr: 0 };
                  return (
                    <tr key={banner.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{banner.title}</div>
                        <div className="text-xs text-gray-400">{BANNER_TYPES.find(t => t.value === banner.banner_type)?.label}</div>
                      </td>
                      <td className="text-right px-4 py-3 text-gray-700 dark:text-gray-300 tabular-nums">{a.impressions.toLocaleString()}</td>
                      <td className="text-right px-4 py-3 text-gray-700 dark:text-gray-300 tabular-nums">{a.clicks.toLocaleString()}</td>
                      <td className="text-right px-4 py-3 text-purple-600 font-medium tabular-nums">{a.ctr.toFixed(1)}%</td>
                      <td className="text-right px-4 py-3 text-green-600 font-medium tabular-nums">{a.conversions.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SHARED UI COMPONENTS
// ============================================================

function Section({ icon: Icon, title, children }: { icon: typeof Edit2; title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none" />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" />
    </div>
  );
}

function DateTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input type="datetime-local" value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Eye; color: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </div>
  );
}
