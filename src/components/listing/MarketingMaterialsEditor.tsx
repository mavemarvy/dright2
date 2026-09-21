import { useRef } from 'react';
import {
  FileText, Image as ImageIcon, Link2, Plus, Trash2, Upload, Video, Megaphone,
} from 'lucide-react';
import {
  inferMarketingMaterialType,
  newMarketingMaterialDraft,
  type MarketingMaterialDraft,
  type MarketingMaterialType,
} from '../../lib/marketingMaterials';

const TYPES: Array<{ value: MarketingMaterialType; label: string }> = [
  { value: 'PDF', label: 'PDF / brochure' },
  { value: 'FLYER', label: 'Flyer' },
  { value: 'BANNER', label: 'Banner' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DRIVE_LINK', label: 'Drive / cloud link' },
  { value: 'LINK', label: 'Website / landing link' },
  { value: 'OTHER', label: 'Other' },
];

export default function MarketingMaterialsEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: MarketingMaterialDraft[];
  onChange: (next: MarketingMaterialDraft[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, changes: Partial<MarketingMaterialDraft>) => {
    onChange(value.map((item) => item.key === key ? { ...item, ...changes } : item));
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      ...newMarketingMaterialDraft(inferMarketingMaterialType(file)),
      title: file.name.replace(/\.[^.]+$/, ''),
      file,
    }));
    onChange([...value, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addLink = () => onChange([...value, newMarketingMaterialDraft('LINK')]);

  return (
    <section className={compact ? 'space-y-3' : 'rounded-2xl border border-violet-100 bg-violet-50/40 p-5 space-y-4'}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-violet-600" />
            <h3 className="font-bold text-gray-900">Affiliate & marketing materials</h3>
            <span className="text-[10px] font-black uppercase tracking-wide rounded-full bg-white border border-violet-200 text-violet-700 px-2 py-1">Optional</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Add flyers, banners, PDFs, videos, Drive links or landing pages that affiliates and sales partners can use to promote this listing. Leaving this empty never blocks publishing.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.zip,.docx,.pptx,image/*,video/*,application/pdf"
            onChange={(event) => addFiles(event.target.files)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={addLink}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Add link
          </button>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-violet-200 bg-white/70 p-4 text-center">
          <FileText className="w-7 h-7 text-violet-300 mx-auto" />
          <p className="text-xs text-gray-500 mt-2">No marketing materials added. You can publish without them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((item, index) => {
            const Icon = item.material_type === 'VIDEO'
              ? Video
              : ['FLYER','BANNER','IMAGE'].includes(item.material_type)
                ? ImageIcon
                : ['LINK','DRIVE_LINK'].includes(item.material_type)
                  ? Link2
                  : FileText;
            return (
              <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500">Type</label>
                      <select
                        value={item.material_type}
                        disabled={disabled}
                        onChange={(e) => patch(item.key, { material_type: e.target.value as MarketingMaterialType })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                      >
                        {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500">Title</label>
                      <input
                        value={item.title}
                        disabled={disabled}
                        onChange={(e) => patch(item.key, { title: e.target.value })}
                        placeholder={item.file?.name || `Marketing material ${index + 1}`}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                      />
                    </div>
                    {!item.file && (
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-gray-500">Link</label>
                        <input
                          type="url"
                          value={item.url}
                          disabled={disabled}
                          onChange={(e) => patch(item.key, { url: e.target.value })}
                          placeholder="https://drive.google.com/... or https://..."
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                        />
                      </div>
                    )}
                    {item.file && (
                      <div className="sm:col-span-2 text-xs text-gray-500">
                        Selected file: <span className="font-semibold text-gray-700">{item.file.name}</span>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-gray-500">Instructions / description</label>
                      <input
                        value={item.description}
                        disabled={disabled}
                        onChange={(e) => patch(item.key, { description: e.target.value })}
                        placeholder="Optional note for affiliates — recommended caption, dimensions, usage, etc."
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(value.filter((candidate) => candidate.key !== item.key))}
                    className="self-start p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    aria-label="Remove marketing material"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
