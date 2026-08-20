import { Link } from 'react-router-dom';
import {
  Star, BadgeCheck, Sparkles, Eye, Clock, Calendar,
  ChevronRight, Package, Download, Briefcase, GraduationCap, Megaphone,
} from 'lucide-react';
import { getListingConfig } from './listingTypes';

interface ListingHeaderProps {
  title: string;
  category: string;
  subcategory?: string | null;
  listingType: string;
  approvalStatus?: string;
  isFree?: boolean;
  averageRating?: number;
  totalReviews?: number;
  sellerVerified?: boolean;
  sellerName?: string;
  sellerId?: string;
  viewCount?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Download, Sparkles, Briefcase, GraduationCap, Megaphone,
};

export default function ListingHeader({
  title, category, subcategory, listingType,
  isFree, averageRating, totalReviews, sellerVerified, sellerName, sellerId,
  viewCount, createdAt, updatedAt,
}: ListingHeaderProps) {
  const config = getListingConfig(listingType);
  const TypeIcon = TYPE_ICON[config.icon] || Package;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const publishedDate = formatDate(createdAt);
  const updatedDate = formatDate(updatedAt || undefined);

  return (
    <div className="space-y-3">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary-50 text-primary-700">
          {category}
        </span>
        {subcategory && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center gap-0.5">
            <ChevronRight className="w-3 h-3" />{subcategory}
          </span>
        )}
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
          <TypeIcon className="w-3 h-3" />{config.label}
        </span>
        {isFree && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-success-muted text-success">FREE</span>
        )}
        {sellerVerified && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1">
            <BadgeCheck className="w-3 h-3" />Verified
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
        {title}
      </h1>

      {/* Rating + Seller */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        {(averageRating ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= Math.round(averageRating || 0) ? 'fill-warning text-warning' : 'text-gray-300'}`}
                />
              ))}
            </div>
            <span className="font-medium text-gray-700">{Number(averageRating).toFixed(1)}</span>
            <span className="text-gray-400">({totalReviews || 0} reviews)</span>
          </div>
        )}
        {sellerName && (
          <span className="text-gray-400 flex items-center gap-1">
            by{' '}
            {sellerId ? (
              <Link to={`/shop/${sellerId}`} className="text-primary-600 hover:text-primary-700 font-medium">
                {sellerName}
              </Link>
            ) : (
              <span className="font-medium text-gray-600">{sellerName}</span>
            )}
          </span>
        )}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
        {publishedDate && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />Listed {publishedDate}
          </span>
        )}
        {updatedDate && updatedDate !== publishedDate && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />Updated {updatedDate}
          </span>
        )}
        {(viewCount ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />{viewCount} views
          </span>
        )}
      </div>
    </div>
  );
}
