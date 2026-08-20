import {
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  useState,
  useEffect,
} from 'react';
import { CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Dialog, Button } from './index';

/* ─── Alert / InlineBanner ──────────────────────────────────── */

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const alertStyles: Record<AlertVariant, string> = {
  success: 'bg-success-muted dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  error: 'bg-error-muted dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
  warning: 'bg-warning-muted dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
};

const alertIcons: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle className="w-5 h-5 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 shrink-0" />,
  warning: <AlertCircle className="w-5 h-5 shrink-0" />,
  info: <AlertCircle className="w-5 h-5 shrink-0" />,
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${alertStyles[variant]} ${className}`}
    >
      {alertIcons[variant]}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}

/* ─── FormField wrapper ─────────────────────────────────────── */

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, error, hint, required, children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-error ml-0.5" aria-label="required">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-error flex items-center gap-1" role="alert">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── Input ──────────────────────────────────────────────────── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export function Input({ error, leftIcon, rightSlot, className = '', id, ...props }: InputProps) {
  return (
    <div className="relative">
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          {leftIcon}
        </span>
      )}
      <input
        id={id}
        aria-invalid={error || undefined}
        className={`input-base ${leftIcon ? 'pl-10' : ''} ${rightSlot ? 'pr-10' : ''} ${
          error ? 'border-error focus:border-error focus:ring-error/20' : ''
        } ${className}`}
        {...props}
      />
      {rightSlot && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          {rightSlot}
        </span>
      )}
    </div>
  );
}

/* ─── PasswordInput with visibility toggle + strength ──────── */

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  showStrength?: boolean;
  error?: boolean;
}

function calcStrength(value: string): number {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score;
}

const strengthLabels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = ['bg-error', 'bg-error', 'bg-warning', 'bg-blue-500', 'bg-success'];

export function PasswordInput({ showStrength = false, error, id, value, className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const strength = calcStrength(typeof value === 'string' ? value : '');

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error || undefined}
          value={value}
          className={`input-base pr-10 ${error ? 'border-error focus:border-error focus:ring-error/20' : ''} ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {showStrength && typeof value === 'string' && value.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < strength ? strengthColors[strength] : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">{strengthLabels[strength]}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Textarea ──────────────────────────────────────────────── */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  showCount?: boolean;
  maxLength?: number;
}

export function Textarea({ error, showCount, maxLength, id, className = '', value, ...props }: TextareaProps) {
  const len = typeof value === 'string' ? value.length : 0;

  return (
    <div className="space-y-1">
      <textarea
        id={id}
        aria-invalid={error || undefined}
        value={value}
        maxLength={maxLength}
        className={`input-base resize-y min-h-[80px] ${error ? 'border-error focus:border-error focus:ring-error/20' : ''} ${className}`}
        {...props}
      />
      {showCount && maxLength && (
        <p className={`text-xs text-right ${len > maxLength * 0.9 ? 'text-warning' : 'text-gray-400 dark:text-gray-500'}`}>
          {len}/{maxLength}
        </p>
      )}
    </div>
  );
}

/* ─── Select ────────────────────────────────────────────────── */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ error, id, className = '', children, ...props }: SelectProps) {
  return (
    <select
      id={id}
      aria-invalid={error || undefined}
      className={`input-base appearance-none bg-no-repeat pr-10 cursor-pointer ${
        error ? 'border-error focus:border-error focus:ring-error/20' : ''
      } ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundPosition: 'right 0.75rem center',
        backgroundSize: '1.25rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

/* ─── ConfirmDialog ─────────────────────────────────────────── */

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      {message && <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{message}</p>}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'primary' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/* ─── useAutoSave hook ──────────────────────────────────────── */

export function useAutoSave<T>(value: T, saveFn: (value: T) => Promise<void> | void, delay = 1500, enabled = true) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await saveFn(value);
        setSavedAt(new Date());
      } finally {
        setSaving(false);
      }
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, delay]);

  return { saving, savedAt };
}
