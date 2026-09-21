import { BadgeCheck, ExternalLink, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminDrightStarterProductSettings from '../../components/admin/AdminDrightStarterProductSettings';
import AdminDrightOfficialProductManager from '../../components/admin/AdminDrightOfficialProductManager';

export default function AdminDrightStorePage() {
  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-950 to-blue-700 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Official DRIGHT Store</h1>
                <BadgeCheck className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage DRIGHT-owned products, public visibility, pricing, affiliate commission, included access, and official presentation.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/dright" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <ExternalLink className="w-4 h-4" /> Store
          </Link>
          <Link to="/dright/starter" target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white">
            <ExternalLink className="w-4 h-4" /> Starter Product
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 p-4 text-sm text-blue-900 dark:text-blue-200">
        <strong>Currency rule:</strong> the price/currency configured here is the authoritative product and checkout price. Marketplace and dashboard cards may convert that amount into each viewer's selected display currency without changing the transaction currency.
      </div>

      <AdminDrightStarterProductSettings />
      <AdminDrightOfficialProductManager />
    </div>
  );
}
