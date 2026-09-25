import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type NetworkPolicy = {
  enabled?: boolean;
  recheck_hours?: number;
};

export default function NetworkRiskReporter() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data: policyData, error: policyError } = await supabase.rpc('get_my_network_fraud_policy');
          if (policyError || cancelled) return;
          const policy = (policyData || {}) as NetworkPolicy;
          if (policy.enabled === false) return;

          const recheckHours = Math.max(1, Number(policy.recheck_hours || 12));
          const key = 'dright:network-risk-check:' + user.id;
          const previous = Number(window.localStorage.getItem(key) || 0);
          if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < recheckHours * 60 * 60 * 1000) return;

          const { data, error } = await supabase.functions.invoke('network-risk-check', { body: {} });
          if (cancelled || error) return;
          const result = (data || {}) as { checked?: boolean };
          if (result.checked !== false) {
            window.localStorage.setItem(key, String(Date.now()));
          }
        } catch {
          // Fraud telemetry must never block normal DRIGHT navigation.
        }
      })();
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user?.id]);

  return null;
}
