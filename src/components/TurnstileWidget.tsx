import { useEffect, useRef } from 'react';
import { useTurnstile } from '../lib/security/turnstileHooks';
import type { TurnstileAction } from '../lib/security/turnstile';

interface TurnstileWidgetProps {
  action: TurnstileAction;
  onVerified?: (token: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function TurnstileWidget({ action, onVerified, onError, className = '' }: TurnstileWidgetProps) {
  const containerId = useRef(`turnstile-${Math.random().toString(36).slice(2, 10)}`).current;
  const { render, token, error, reset } = useTurnstile(action, containerId);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    if (token) onVerified?.(token);
  }, [token, onVerified]);

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  return (
    <div className={className}>
      <div id={containerId} className="min-h-[65px]" />
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
      {error && (
        <button
          onClick={() => {
            reset();
            render();
          }}
          className="text-xs text-primary-600 hover:text-primary-700 mt-1"
        >
          Retry
        </button>
      )}
    </div>
  );
}
