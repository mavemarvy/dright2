import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, Bell, BellOff, Sparkles, ChevronDown, SlidersHorizontal } from 'lucide-react';
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
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <Icon className={`w-4 h-4 ${checked ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} />
      <span className="flex-1 text-left">{label}</span>
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
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
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
        aria-expanded={open}
        aria-controls="interface-options-menu"
      >
        <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-left">Interface Options</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="interface-options-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pl-2 space-y-1">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
