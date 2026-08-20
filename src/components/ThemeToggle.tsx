import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'default' | 'dark';
}

export default function ThemeToggle({ variant = 'default' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const baseClasses = 'relative w-10 h-10 rounded-xl transition-colors flex items-center justify-center';
  const variantClasses = variant === 'dark'
    ? 'bg-gray-700 hover:bg-gray-600'
    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600';

  return (
    <button
      onClick={toggleTheme}
      className={`${baseClasses} ${variantClasses}`}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === 'dark' ? 180 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {theme === 'light' ? (
          <Sun className="w-5 h-5 text-warning" />
        ) : (
          <Moon className="w-5 h-5 text-primary-400" />
        )}
      </motion.div>
    </button>
  );
}
