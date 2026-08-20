import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Briefcase,
} from 'lucide-react';
import type { ProfileProduct } from './profileTypes';
import { formatCurrency } from '../../lib/currency';

interface ServicePortfolioProps {
  services: ProfileProduct[];
  portfolioItems: Array<{ id: string; title: string; image_url: string; description?: string }>;
  sellerName: string | null;
}

export function ServicePortfolio({ services, portfolioItems, sellerName }: ServicePortfolioProps) {
  const featuredServices = services.filter((s) => s.product_type === 'SERVICE' || s.product_type === 'COURSE').slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Featured Services */}
      {featuredServices.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Featured Services</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredServices.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
              >
                <Link to={`/product/${service.id}`} className="block relative h-36 bg-gray-50 dark:bg-gray-800 overflow-hidden">
                  {service.image_url ? (
                    <img src={service.image_url} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  {service.product_type === 'COURSE' && (
                    <span className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      Course
                    </span>
                  )}
                </Link>
                <div className="p-4 flex flex-col flex-1">
                  <Link to={`/product/${service.id}`}>
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 hover:text-indigo-500 transition-colors">
                      {service.name}
                    </h4>
                  </Link>
                  {service.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{service.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-3">
                    <span className="text-base font-bold text-gray-900 dark:text-white">
                      {service.is_free ? 'Free' : formatCurrency(Number(service.price))}
                    </span>
                    {service.total_reviews && service.total_reviews > 0 && (
                      <span className="text-xs text-gray-500">
                        {Number(service.average_rating || 0).toFixed(1)} reviews
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Gallery */}
      {portfolioItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {portfolioItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 group cursor-pointer"
              >
                <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                  <p className="text-xs font-medium text-white line-clamp-2">{item.title}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {featuredServices.length === 0 && portfolioItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
            <Briefcase className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            {sellerName || 'This provider'} hasn't added any services or portfolio items yet.
          </p>
        </div>
      )}
    </div>
  );
}
