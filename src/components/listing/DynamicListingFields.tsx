import type { MarketplaceAttributeDefinition } from '../../lib/listingEngine';

interface Props {
  definitions: MarketplaceAttributeDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

type Option = { label: string; value: string };

function optionsOf(raw: unknown[]): Option[] {
  return raw.map(option => {
    if (typeof option === 'string' || typeof option === 'number') {
      const value = String(option);
      return { label: value, value };
    }
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      const value = String(record.value ?? record.label ?? '');
      return { label: String(record.label ?? value), value };
    }
    return { label: String(option ?? ''), value: String(option ?? '') };
  }).filter(option => option.value.length > 0);
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function DynamicListingFields({
  definitions,
  values,
  onChange,
  disabled = false,
}: Props) {
  if (definitions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Additional Listing Details</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          These fields adapt to the listing type and category.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {definitions.map(definition => {
          const value = values[definition.attribute_key];
          const options = optionsOf(definition.options ?? []);
          const fullWidth = ['textarea','multi_select','radio','tags'].includes(definition.input_type);

          return (
            <div
              key={definition.id}
              className={fullWidth ? 'md:col-span-2' : ''}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {definition.label}
                {definition.is_required && <span className="text-error ml-1">*</span>}
              </label>

              {definition.input_type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={stringValue(value)}
                  disabled={disabled}
                  onChange={event => onChange(definition.attribute_key, event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none resize-none disabled:bg-gray-100"
                />
              ) : definition.input_type === 'select' ? (
                <select
                  value={stringValue(value)}
                  disabled={disabled}
                  onChange={event => onChange(definition.attribute_key, event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white disabled:bg-gray-100"
                >
                  <option value="">Select an option</option>
                  {options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : definition.input_type === 'multi_select' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {options.map(option => {
                    const selected = Array.isArray(value)
                      ? value.map(String).includes(option.value)
                      : false;
                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={event => {
                            const current = Array.isArray(value) ? value.map(String) : [];
                            onChange(
                              definition.attribute_key,
                              event.target.checked
                                ? [...new Set([...current, option.value])]
                                : current.filter(item => item !== option.value)
                            );
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              ) : definition.input_type === 'radio' ? (
                <div className="flex flex-wrap gap-2">
                  {options.map(option => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={definition.attribute_key}
                        checked={stringValue(value) === option.value}
                        disabled={disabled}
                        onChange={() => onChange(definition.attribute_key, option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : definition.input_type === 'checkbox' || definition.input_type === 'toggle' ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(definition.attribute_key, !Boolean(value))}
                  className="flex items-center justify-between w-full rounded-xl border border-gray-200 px-4 py-3 text-sm disabled:bg-gray-100"
                >
                  <span>{Boolean(value) ? 'Enabled' : 'Disabled'}</span>
                  <span className={`relative w-11 h-6 rounded-full transition-colors ${Boolean(value) ? 'bg-primary-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${Boolean(value) ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              ) : definition.input_type === 'tags' ? (
                <input
                  type="text"
                  value={Array.isArray(value) ? value.join(', ') : stringValue(value)}
                  disabled={disabled}
                  placeholder="Separate values with commas"
                  onChange={event => onChange(
                    definition.attribute_key,
                    event.target.value.split(',').map(item => item.trim()).filter(Boolean)
                  )}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:bg-gray-100"
                />
              ) : (
                <input
                  type={
                    definition.input_type === 'number' || definition.input_type === 'currency' || definition.input_type === 'range'
                      ? 'number'
                      : definition.input_type === 'date'
                        ? 'date'
                        : definition.input_type === 'datetime'
                          ? 'datetime-local'
                          : definition.input_type === 'email'
                            ? 'email'
                            : definition.input_type === 'url'
                              ? 'url'
                              : definition.input_type === 'phone'
                                ? 'tel'
                                : 'text'
                  }
                  value={stringValue(value)}
                  disabled={disabled}
                  onChange={event => {
                    const numeric = ['number','currency','range'].includes(definition.input_type);
                    onChange(
                      definition.attribute_key,
                      numeric
                        ? (event.target.value === '' ? '' : Number(event.target.value))
                        : event.target.value
                    );
                  }}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:bg-gray-100"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
