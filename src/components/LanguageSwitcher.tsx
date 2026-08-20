import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check, X } from 'lucide-react';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext';

export default function LanguageSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'compact' }) {
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguage();

  const trigger =
    variant === 'sidebar' ? (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 w-full"
      >
        <span className="text-xl leading-none w-5 flex items-center justify-center">{language.flag}</span>
        <span className="flex-1 text-left">{language.name}</span>
        <Globe className="w-4 h-4 text-gray-400" />
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        aria-label="Change language"
      >
        <span className="text-lg leading-none">{language.flag}</span>
      </button>
    );

  return (
    <>
      {trigger}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/50 z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white rounded-2xl shadow-2xl z-[61] max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-bold text-gray-900">Select Language</h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-3 flex-1">
                <div className="grid grid-cols-1 gap-1">
                  {LANGUAGES.map((lang) => {
                    const isActive = lang.code === language.code;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setOpen(false);
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 font-semibold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl leading-none w-8 flex items-center justify-center">{lang.flag}</span>
                        <span className="flex-1">{lang.name}</span>
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          >
                            <Check className="w-5 h-5 text-primary-600" />
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
