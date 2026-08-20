import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface ProductSpecificationsProps {
  specifications: Record<string, string> | null;
  productType: string;
}

const CATEGORY_SPEC_LABELS: Record<string, Array<{ key: string; label: string }>> = {
  ELECTRONICS: [
    { key: 'Brand', label: 'Brand' },
    { key: 'Model', label: 'Model' },
    { key: 'Storage', label: 'Storage' },
    { key: 'RAM', label: 'RAM' },
    { key: 'Processor', label: 'Processor' },
    { key: 'Display', label: 'Display' },
    { key: 'Battery', label: 'Battery' },
    { key: 'Warranty', label: 'Warranty' },
  ],
  DIGITAL: [
    { key: 'File type', label: 'File Type' },
    { key: 'File size', label: 'File Size' },
    { key: 'Version', label: 'Version' },
    { key: 'Compatible devices', label: 'Compatible Devices' },
    { key: 'Updates included', label: 'Updates' },
    { key: 'License', label: 'License' },
    { key: 'Download limit', label: 'Download Limit' },
    { key: 'Documentation', label: 'Documentation' },
  ],
  SERVICE: [
    { key: 'Delivery time', label: 'Delivery Time' },
    { key: 'Revision count', label: 'Revisions' },
    { key: 'Online/Offline', label: 'Mode' },
    { key: 'Coverage area', label: 'Coverage Area' },
    { key: 'Requirements', label: 'Requirements' },
  ],
  COURSE: [
    { key: 'Duration', label: 'Duration' },
    { key: 'Lessons', label: 'Number of Lessons' },
    { key: 'Level', label: 'Skill Level' },
    { key: 'Certificate', label: 'Certificate' },
    { key: 'Access', label: 'Access Period' },
    { key: 'Prerequisites', label: 'Prerequisites' },
  ],
  JOB: [
    { key: 'Employment type', label: 'Employment Type' },
    { key: 'Salary', label: 'Salary' },
    { key: 'Experience', label: 'Experience Required' },
    { key: 'Education', label: 'Education' },
    { key: 'Deadline', label: 'Application Deadline' },
  ],
};

export default function ProductSpecifications({ specifications, productType }: ProductSpecificationsProps) {
  const [showAll, setShowAll] = useState(false);

  const specLabels = CATEGORY_SPEC_LABELS[productType] || [];
  const specs = specifications || {};

  // Merge: use stored specs plus any predefined labels that have values
  const allEntries = Object.entries(specs);
  const hasData = allEntries.length > 0;

  if (!hasData && specLabels.length === 0) return null;

  const visibleEntries = showAll ? allEntries : allEntries.slice(0, 6);

  return (
    <div className="mt-8 pt-6 border-t border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Specifications</h3>

      {hasData ? (
        <div className="bg-gray-50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {visibleEntries.map(([key, value], idx) => (
                <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-600 w-1/3 align-top">{key}</td>
                  <td className="px-4 py-3 text-gray-900">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allEntries.length > 6 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full py-3 text-sm font-medium text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center gap-1.5 border-t border-gray-100"
            >
              {showAll ? 'Show Less' : `Show All ${allEntries.length} Specs`}
              <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {specLabels.map(spec => (
            <div key={spec.key} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-500">{spec.label}</span>
              <span className="text-sm font-medium text-gray-400 italic">Not specified</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
