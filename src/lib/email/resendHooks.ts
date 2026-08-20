import { useState, useCallback } from 'react';
import { sendEmail, fetchEmailLogs, type EmailTemplateType, type EmailResult } from '../email/resend';

export function useEmailSender() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailResult | null>(null);

  const send = useCallback(async (templateType: EmailTemplateType, to: string, data: Record<string, unknown> = {}, userId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendEmail(templateType, to, data, userId);
      if (!res.success) setError(res.error || 'Email send failed');
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return { success: false, error: String(err) } as EmailResult;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, send, setError };
}

export function useEmailLogs(userId: string | null) {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await fetchEmailLogs(userId);
    setLogs(data);
    setLoading(false);
  }, [userId]);

  return { logs, loading, refresh };
}
