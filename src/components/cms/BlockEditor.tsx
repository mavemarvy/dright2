import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import type { CmsBlock } from '../../lib/cmsTypes';

interface BlockEditorProps {
  block: CmsBlock;
  onSave: (updates: Partial<CmsBlock>) => void;
  onClose: () => void;
}

export default function BlockEditor({ block, onSave, onClose }: BlockEditorProps) {
  const [data, setData] = useState<Record<string, unknown>>(block.block_data || {});
  const [title, setTitle] = useState(block.title || '');

  const handleSave = () => {
    onSave({ block_data: data, title: title || null, status: 'published' });
  };

  const update = (key: string, value: unknown) => setData(prev => ({ ...prev, [key]: value }));

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="font-semibold text-gray-900 dark:text-white">Edit {block.block_type} Block</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Block Title (admin label)</label>
            <input className="editor-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Internal label" />
          </div>

          {block.block_type === 'hero' && <HeroEditor data={data} update={update} />}
          {block.block_type === 'banner' && <BannerEditor data={data} update={update} />}
          {block.block_type === 'text' && <TextEditor data={data} update={update} />}
          {block.block_type === 'image' && <ImageEditor data={data} update={update} />}
          {block.block_type === 'video' && <VideoEditor data={data} update={update} />}
          {block.block_type === 'card' && <CardEditor data={data} update={update} />}
          {block.block_type === 'faq' && <FaqEditor data={data} update={update} />}
          {block.block_type === 'countdown' && <CountdownEditor data={data} update={update} />}
          {block.block_type === 'divider' && <DividerEditor data={data} update={update} />}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 p-4 flex gap-3">
          <button onClick={handleSave} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm">Save Block</button>
          <button onClick={onClose} className="px-6 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium text-sm">Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Field helpers ──────────────────────────────────────────────────────────────

function TextField({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {multiline ? (
        <textarea className="editor-input" rows={4} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className="editor-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input type="number" className="editor-input" value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <select className="editor-input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

// ─── Per-type editors ───────────────────────────────────────────────────────────

function HeroEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return (
    <>
      <TextField label="Title" value={(data.title as string) || ''} onChange={v => update('title', v)} />
      <TextField label="Subtitle" value={(data.subtitle as string) || ''} onChange={v => update('subtitle', v)} />
      <TextField label="Description" value={(data.description as string) || ''} onChange={v => update('description', v)} multiline />
      <TextField label="Background Image URL" value={(data.background_image as string) || ''} onChange={v => update('background_image', v)} placeholder="https://..." />
      <TextField label="Background Video URL" value={(data.background_video as string) || ''} onChange={v => update('background_video', v)} placeholder="https://..." />
      <SelectField label="Alignment" value={(data.alignment as string) || 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} onChange={v => update('alignment', v)} />
    </>
  );
}

function BannerEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const banners = (data.banners as Array<{ id: string; image_url: string; link_url: string | null; alt_text: string }>) || [];
  return (
    <>
      <ToggleField label="Carousel mode" value={(data.carousel as boolean) || false} onChange={v => update('carousel', v)} />
      {data.carousel && (
        <>
          <ToggleField label="Auto-slide" value={(data.auto_slide as boolean) || false} onChange={v => update('auto_slide', v)} />
          <NumberField label="Auto-slide interval (ms)" value={(data.auto_slide_interval as number) || 5000} onChange={v => update('auto_slide_interval', v)} />
        </>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Banners</label>
        <div className="space-y-2">
          {banners.map((banner, i) => (
            <div key={banner.id} className="flex gap-2 items-start p-3 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex-1 space-y-2">
                <input className="editor-input" placeholder="Image URL" value={banner.image_url} onChange={e => { const n = [...banners]; n[i] = { ...banner, image_url: e.target.value }; update('banners', n); }} />
                <input className="editor-input" placeholder="Link URL (optional)" value={banner.link_url || ''} onChange={e => { const n = [...banners]; n[i] = { ...banner, link_url: e.target.value || null }; update('banners', n); }} />
                <input className="editor-input" placeholder="Alt text" value={banner.alt_text} onChange={e => { const n = [...banners]; n[i] = { ...banner, alt_text: e.target.value }; update('banners', n); }} />
              </div>
              <button onClick={() => update('banners', banners.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => update('banners', [...banners, { id: crypto.randomUUID(), image_url: '', link_url: null, alt_text: '' }])} className="mt-2 flex items-center gap-1 text-sm text-blue-600"><Plus className="w-4 h-4" /> Add Banner</button>
      </div>
    </>
  );
}

function TextEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return <TextField label="HTML Content" value={(data.content as string) || ''} onChange={v => update('content', v)} multiline placeholder="<h2>Title</h2><p>Your content...</p>" />;
}

function ImageEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const images = (data.images as Array<{ id: string; url: string; alt_text: string; caption: string }>) || [];
  return (
    <>
      <SelectField label="Layout" value={(data.layout as string) || 'single'} options={[{ value: 'single', label: 'Single' }, { value: 'gallery', label: 'Gallery' }, { value: 'grid', label: 'Grid' }, { value: 'masonry', label: 'Masonry' }]} onChange={v => update('layout', v)} />
      {data.layout === 'grid' && <NumberField label="Columns" value={(data.columns as number) || 3} onChange={v => update('columns', v)} />}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Images</label>
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={img.id} className="flex gap-2 items-start p-3 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex-1 space-y-2">
                <input className="editor-input" placeholder="Image URL" value={img.url} onChange={e => { const n = [...images]; n[i] = { ...img, url: e.target.value }; update('images', n); }} />
                <input className="editor-input" placeholder="Alt text" value={img.alt_text} onChange={e => { const n = [...images]; n[i] = { ...img, alt_text: e.target.value }; update('images', n); }} />
                <input className="editor-input" placeholder="Caption" value={img.caption} onChange={e => { const n = [...images]; n[i] = { ...img, caption: e.target.value }; update('images', n); }} />
              </div>
              <button onClick={() => update('images', images.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => update('images', [...images, { id: crypto.randomUUID(), url: '', alt_text: '', caption: '' }])} className="mt-2 flex items-center gap-1 text-sm text-blue-600"><Plus className="w-4 h-4" /> Add Image</button>
      </div>
    </>
  );
}

function VideoEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return (
    <>
      <SelectField label="Video Type" value={(data.video_type as string) || 'youtube'} options={[{ value: 'youtube', label: 'YouTube' }, { value: 'vimeo', label: 'Vimeo' }, { value: 'direct', label: 'Direct URL' }]} onChange={v => update('video_type', v)} />
      <TextField label="Video URL" value={(data.video_url as string) || ''} onChange={v => update('video_url', v)} placeholder="https://youtube.com/watch?v=..." />
      <TextField label="Poster Image URL" value={(data.poster_image as string) || ''} onChange={v => update('poster_image', v)} />
      <ToggleField label="Autoplay" value={(data.autoplay as boolean) || false} onChange={v => update('autoplay', v)} />
    </>
  );
}

function CardEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const cards = (data.cards as Array<{ id: string; image_url: string | null; title: string; description: string; cta_text: string | null; cta_link: string | null }>) || [];
  return (
    <>
      <SelectField label="Card Style" value={(data.card_style as string) || 'feature'} options={[{ value: 'feature', label: 'Feature' }, { value: 'service', label: 'Service' }, { value: 'promotion', label: 'Promotion' }, { value: 'information', label: 'Information' }]} onChange={v => update('card_style', v)} />
      <NumberField label="Columns" value={(data.columns as number) || 3} onChange={v => update('columns', v)} />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cards</label>
        <div className="space-y-2">
          {cards.map((card, i) => (
            <div key={card.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Card {i + 1}</span>
                <button onClick={() => update('cards', cards.filter((_, idx) => idx !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
              <input className="editor-input" placeholder="Image URL" value={card.image_url || ''} onChange={e => { const n = [...cards]; n[i] = { ...card, image_url: e.target.value || null }; update('cards', n); }} />
              <input className="editor-input" placeholder="Title" value={card.title} onChange={e => { const n = [...cards]; n[i] = { ...card, title: e.target.value }; update('cards', n); }} />
              <textarea className="editor-input" rows={2} placeholder="Description" value={card.description} onChange={e => { const n = [...cards]; n[i] = { ...card, description: e.target.value }; update('cards', n); }} />
              <div className="flex gap-2">
                <input className="editor-input" placeholder="CTA text" value={card.cta_text || ''} onChange={e => { const n = [...cards]; n[i] = { ...card, cta_text: e.target.value || null }; update('cards', n); }} />
                <input className="editor-input" placeholder="CTA link" value={card.cta_link || ''} onChange={e => { const n = [...cards]; n[i] = { ...card, cta_link: e.target.value || null }; update('cards', n); }} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => update('cards', [...cards, { id: crypto.randomUUID(), image_url: null, title: '', description: '', cta_text: null, cta_link: null }])} className="mt-2 flex items-center gap-1 text-sm text-blue-600"><Plus className="w-4 h-4" /> Add Card</button>
      </div>
    </>
  );
}

function FaqEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const items = (data.items as Array<{ id: string; question: string; answer: string }>) || [];
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">FAQ Items</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Q{i + 1}</span>
              <button onClick={() => update('items', items.filter((_, idx) => idx !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            <input className="editor-input" placeholder="Question" value={item.question} onChange={e => { const n = [...items]; n[i] = { ...item, question: e.target.value }; update('items', n); }} />
            <textarea className="editor-input" rows={3} placeholder="Answer" value={item.answer} onChange={e => { const n = [...items]; n[i] = { ...item, answer: e.target.value }; update('items', n); }} />
          </div>
        ))}
      </div>
      <button onClick={() => update('items', [...items, { id: crypto.randomUUID(), question: '', answer: '' }])} className="mt-2 flex items-center gap-1 text-sm text-blue-600"><Plus className="w-4 h-4" /> Add Question</button>
    </div>
  );
}

function CountdownEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return (
    <>
      <TextField label="Title" value={(data.title as string) || ''} onChange={v => update('title', v)} />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Date & Time</label>
        <input type="datetime-local" className="editor-input" value={(data.target_date as string)?.slice(0, 16) || ''} onChange={e => update('target_date', e.target.value ? new Date(e.target.value).toISOString() : '')} />
      </div>
      <ToggleField label="Show Days" value={(data.show_days as boolean) ?? true} onChange={v => update('show_days', v)} />
      <ToggleField label="Show Hours" value={(data.show_hours as boolean) ?? true} onChange={v => update('show_hours', v)} />
      <ToggleField label="Show Minutes" value={(data.show_minutes as boolean) ?? true} onChange={v => update('show_minutes', v)} />
      <ToggleField label="Show Seconds" value={(data.show_seconds as boolean) ?? true} onChange={v => update('show_seconds', v)} />
    </>
  );
}

function DividerEditor({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return (
    <>
      <NumberField label="Height (px)" value={(data.height as number) || 24} onChange={v => update('height', v)} />
      <ToggleField label="Show line" value={(data.show_line as boolean) || false} onChange={v => update('show_line', v)} />
    </>
  );
}
