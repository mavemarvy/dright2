import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { FollowersList } from '../components/Social';

export default function FollowersPage() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/profile/${userId}`} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Followers</h1>
      </div>
      <FollowersList userId={userId || ''} type="followers" />
    </div>
  );
}
