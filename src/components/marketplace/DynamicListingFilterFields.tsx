import type { MarketplaceAttributeDefinition } from '../../lib/listingEngine';

interface Props {
  definitions: MarketplaceAttributeDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function optionsOf(raw: unknown[]): string[] {
  return raw
    .map(option => {
      if (typeof option === 'string' || typeof option === 'number') return String(option);
      if (option && typeof option === 'object') {
        const record = option as Record<string, unknown>;
        return String(record.value ?? record.label ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

export default function DynamicListingFilterFields({
  definitions,
  values,
  onChange,
}: Props) {
  const filterable = definitions.filter(definition => definition.is_filterable);
  if (filterable.length === 0) return null;

  return (
    <>
      {filterable.map(definition => {
        const value = values[definition.attribute_key];
        const options = optionsOf(definition.options ?? []);

        if (definition.input_type === 'toggle' || definition.input_type === 'checkbox') {
          const normalized = value === true ? 'true' : value === false ? 'false' : '';
          return (
            <div key={definition.id}>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                {definition.label}
              </label>
              <select
                value={normalized}
                onChange={event => onChange(
                  definition.attribute_key,
                  event.target.value === '' ? '' : event.target.value === 'true'
                )}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white"
              >
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          );
        }

        if (definition.input_type === 'select' || definition.input_type === 'radio') {
          return (
            <div key={definition.id}>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                {definition.label}
              </label>
              <select
                value={typeof value === 'string' ? value : ''}
                onChange={event => onChange(definition.attribute_key, event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white"
              >
                <option value="">Any</option>
                {options.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          );
        }

        if (definition.input_type === 'multi_select') {
          return (
            <div key={definition.id}>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                {definition.label}
              </label>
              <select
                value={Array.isArray(value) ? String(value[0] ?? '') : ''}
                onChange={event => onChange(
                  definition.attribute_key,
                  event.target.value ? [event.target.value] : []
                )}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white"
              >
                <option value="">Any</option>
                {options.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          );
        }

        const numeric = ['number', 'currency', 'range'].includes(definition.input_type);
        return (
          <div key={definition.id}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              {definition.label}
            </label>
            <input
              type={numeric ? 'number' : 'text'}
              value={value === null || value === undefined ? '' : String(value)}
              onChange={event => onChange(
                definition.attribute_key,
                numeric
                  ? (event.target.value === '' ? '' : Number(event.target.value))
                  : event.target.value
              )}
              placeholder="Any"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
            />
          </div>
        );
      })}
    </>
  );
}
