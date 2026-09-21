import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight, Loader2, ShieldCheck, Store, Users } from 'lucide-react';
import { DrightBrand, DrightMark } from '../components/DrightBrand';
import { fetchDrightStarterProduct, type DrightStarterPublicSettings } from '../lib/drightStarter';
import { fetchPublicDrightOfficialProducts, type DrightOfficialProduct } from '../lib/drightOfficialStore';
import { formatDisplayCurrency } from '../lib/currency';
import SeoHead from '../components/SeoHead';

export default function DrightOfficialStorePage() {
  const [settings, setSettings] = useState<DrightStarterPublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [officialProducts, setOfficialProducts] = useState<DrightOfficialProduct[]>([]);

  useEffect(() => {
    void Promise.all([
      fetchDrightStarterProduct(),
      fetchPublicDrightOfficialProducts(),
    ]).then(([value, products]) => {
      setSettings(value);
      setOfficialProducts(products);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>;
  }

  if (!settings?.available || !settings.store || !settings.product) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
        <div className="text-center max-w-md">
          <DrightMark size={72} className="mx-auto" />
          <h1 className="text-2xl font-black mt-5 text-gray-900 dark:text-white">Official DRIGHT Store</h1>
          <p className="text-sm text-gray-500 mt-2">The store is currently unavailable.</p>
        </div>
      </div>
    );
  }

  const { store, product } = settings;

  return (
    <>
      <SeoHead
        title="Official DRIGHT Store"
        description={store.description}
        canonical="/dright"
        keywords={['DRIGHT Store', 'DRIGHT official', 'DRIGHT Starter']}
        breadcrumbs={[{ name: 'DRIGHT Store', url: '/dright' }]}
      />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <section className="bg-slate-950 text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <div className="flex items-center gap-3">
              <DrightBrand size={58} className="[&_div]:text-white" />
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-200 px-3 py-1 text-xs font-bold">
                <BadgeCheck className="w-3.5 h-3.5" /> Official Store
              </span>
            </div>
            <h1 className="mt-7 text-4xl sm:text-5xl font-black">{store.name} Store</h1>
            <p className="mt-3 text-xl text-slate-300">{store.tagline}</p>
            <p className="mt-4 max-w-2xl text-sm sm:text-base leading-7 text-slate-400">{store.description}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="inline-flex gap-1.5 items-center rounded-full bg-white/5 px-3 py-2"><ShieldCheck className="w-4 h-4" /> First-party products</span>
              <span className="inline-flex gap-1.5 items-center rounded-full bg-white/5 px-3 py-2"><Users className="w-4 h-4" /> Affiliate trackable</span>
              <span className="inline-flex gap-1.5 items-center rounded-full bg-white/5 px-3 py-2"><Store className="w-4 h-4" /> Owned by DRIGHT</span>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">First official product</p>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1">Start with DRIGHT</h2>
          </div>

          <Link
            to="/dright/starter"
            className="group block overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-xl transition-shadow"
          >
            <div className="grid md:grid-cols-[220px_1fr]">
              <div className="min-h-[210px] bg-gradient-to-br from-slate-950 via-slate-900 to-primary-950 flex items-center justify-center overflow-hidden">
                {product.image_url && product.image_url !== '/dright-logo.webp' ? (
                  <img src={product.image_url} alt={product.title} className="w-full h-full min-h-[210px] object-cover" />
                ) : (
                  <div className="text-center p-8">
                    <DrightMark size={100} className="mx-auto" />
                    <p className="text-white font-black mt-4 tracking-[0.14em] text-sm">STARTER ACCESS</p>
                  </div>
                )}
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-primary-600 uppercase tracking-wide">{product.category}</span>
                  <span className="text-xl font-black text-gray-900 dark:text-white">{formatDisplayCurrency(product.price, product.currency)}</span>
                </div>
                <h3 className="mt-3 text-2xl font-black text-gray-900 dark:text-white">{product.title}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-6">{product.subtitle}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-3 py-1.5">
                    {product.affiliate_commission_percent}% affiliate commission
                  </span>
                  <span className="rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-3 py-1.5">
                    {product.included_trial_days}-day included access
                  </span>
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5">New users only</span>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 font-black text-primary-600 group-hover:gap-3 transition-all">
                  View product <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          </Link>

          {officialProducts.length > 0 && (
            <div className="mt-10">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">More from DRIGHT</p>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-1">Official products</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {officialProducts.map((item) => (
                  <Link
                    key={item.id}
                    to={`/product/${item.marketplace_product_id}`}
                    className="group rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><DrightMark size={72} /></div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wide text-primary-600">{item.category}</span>
                        {item.official_badge_enabled && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <h3 className="font-black text-gray-900 dark:text-white mt-2 line-clamp-2">{item.name}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.subtitle || item.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="font-black text-gray-900 dark:text-white">{formatDisplayCurrency(item.price, item.currency)}</span>
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">{item.affiliate_commission_percent}% affiliate</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
