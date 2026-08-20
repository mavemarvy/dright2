import { motion } from 'framer-motion';
import { MessageSquare, Bell, BellOff, Sparkles } from 'lucide-react';
import { useUIPreferences } from '../lib/uiPreferences';

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof MessageSquare;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <Icon className={`w-4 h-4 ${checked ? 'text-primary-600' : 'text-gray-400'}`} />
      <span className="flex-1 text-left">{label}</span>
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}>
        <motion.span
          layout
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow"
          animate={{ x: checked ? 16 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  );
}

export default function UIPreferencesToggles() {
  const { prefs, update } = useUIPreferences();

  return (
    <div className="pt-3 mt-3 border-t border-gray-100 space-y-1">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        Interface Options
      </p>
      <ToggleRow
        icon={MessageSquare}
        label="Floating Chat Button"
        checked={prefs.showFloatingChat}
        onChange={(v) => update({ showFloatingChat: v })}
      />
      <ToggleRow
        icon={Bell}
        label="Notification Button"
        checked={prefs.showNotificationButton}
        onChange={(v) => update({ showNotificationButton: v })}
      />
      <ToggleRow
        icon={BellOff}
        label="Notification Settings Icon"
        checked={prefs.showNotificationSettingsIcon}
        onChange={(v) => update({ showNotificationSettingsIcon: v })}
      />
      <ToggleRow
        icon={Sparkles}
        label="AI Assistant"
        checked={prefs.aiAssistantEnabled}
        onChange={(v) => update({ aiAssistantEnabled: v })}
      />
      <ToggleRow
        icon={Sparkles}
        label="AI Recommendations"
        checked={prefs.aiRecommendationsEnabled}
        onChange={(v) => update({ aiRecommendationsEnabled: v })}
      />
    </div>
  );
}
