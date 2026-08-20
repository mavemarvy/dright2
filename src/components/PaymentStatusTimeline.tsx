import { useEffect, useState } from 'react';
import { Check, Loader2, Circle } from 'lucide-react';

export interface TimelineStep {
  label: string;
  description?: string;
}

const DEFAULT_STEPS: TimelineStep[] = [
  { label: 'Initializing', description: 'Preparing your payment' },
  { label: 'Creating Transaction', description: 'Setting up the transaction record' },
  { label: 'Redirecting', description: 'Connecting to payment gateway' },
  { label: 'Waiting for Payment', description: 'Complete your payment on the gateway' },
  { label: 'Verifying', description: 'Confirming payment with the gateway' },
  { label: 'Funding Wallet', description: 'Crediting your account' },
  { label: 'Completed', description: 'Payment successful' },
];

interface Props {
  steps?: TimelineStep[];
  currentStep: number;
  failed?: boolean;
  className?: string;
}

export default function PaymentStatusTimeline({
  steps = DEFAULT_STEPS,
  currentStep,
  failed = false,
  className = '',
}: Props) {
  return (
    <div className={`space-y-1 ${className}`}>
      {steps.map((step, i) => {
        const isComplete = i < currentStep;
        const isActive = i === currentStep;
        const isFailed = failed && isActive;
        const isPending = i > currentStep;
        void isPending;

        return (
          <div key={i} className="flex items-start gap-3 py-2">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isComplete
                  ? 'bg-emerald-500 text-white'
                  : isFailed
                    ? 'bg-red-500 text-white'
                    : isActive
                      ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                      : 'bg-gray-100 text-gray-400'
              }`}>
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : isFailed ? (
                  <span className="text-sm font-bold">!</span>
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-0.5 h-8 ${isComplete ? 'bg-emerald-500' : 'bg-gray-200'}`} />
              )}
            </div>

            <div className="pt-1">
              <p className={`text-sm font-medium ${
                isComplete ? 'text-gray-900'
                : isFailed ? 'text-red-600'
                : isActive ? 'text-primary-700'
                : 'text-gray-400'
              }`}>
                {step.label}
              </p>
              {step.description && (
                <p className={`text-xs mt-0.5 ${
                  isComplete || isActive ? 'text-gray-500' : 'text-gray-300'
                }`}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Hook that auto-advances the timeline for wallet funding / product purchase
export function usePaymentTimeline(autoStart: boolean = false) {
  const [currentStep, setCurrentStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(autoStart);

  useEffect(() => {
    if (!active || failed) return;
    if (currentStep >= DEFAULT_STEPS.length - 1) return;

    const timer = setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, DEFAULT_STEPS.length - 1));
    }, currentStep === 3 ? 5000 : 1500); // wait longer on "Waiting for Payment"

    return () => clearTimeout(timer);
  }, [active, currentStep, failed]);

  const start = () => { setActive(true); setCurrentStep(0); setFailed(false); };
  const advance = () => setCurrentStep((prev) => Math.min(prev + 1, DEFAULT_STEPS.length - 1));
  const jumpTo = (step: number) => setCurrentStep(step);
  const fail = () => setFailed(true);
  const reset = () => { setCurrentStep(0); setFailed(false); setActive(false); };

  return { currentStep, failed, active, start, advance, jumpTo, fail, reset };
}
