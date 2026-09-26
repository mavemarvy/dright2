import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function PromotionRedirectPage() {
  const { token } = useParams();
  const [message, setMessage] = useState('Opening promoted DRIGHT content…');

  useEffect(() => {
    if (!token) {
      window.location.replace('/market');
      return;
    }

    void supabase.functions.invoke('promotion-track', { body: { token } })
      .then(({ data, error }) => {
        if (error || !data?.destination) {
          setMessage('The promotion link is unavailable. Opening DRIGHT Marketplace…');
          window.setTimeout(() => window.location.replace('/market'), 700);
          return;
        }
        window.location.replace(String(data.destination));
      })
      .catch(() => {
        setMessage('The promotion link is unavailable. Opening DRIGHT Marketplace…');
        window.setTimeout(() => window.location.replace('/market'), 700);
      });
  }, [token]);

  return <main className="flex min-h-screen items-center justify-center bg-surface-muted p-6">
    <div className="text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
      <p className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-300">{message}</p>
    </div>
  </main>;
}
