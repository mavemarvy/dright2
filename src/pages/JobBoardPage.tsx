import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Briefcase, MapPin, DollarSign, Clock, Building2, Filter,
  X, SlidersHorizontal, Bookmark, BookmarkCheck,
  TrendingUp, ArrowUpDown, LayoutGrid, List,
  Megaphone, Star, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatSalaryRange } from '../lib/currency';
import NapFooter from '../components/NapFooter';
import type { Job, JobType, WorkSetup, CareerLevel } from '../lib/types';

const JOB_CATEGORIES = [
  'Advertising & Marketing',
  'YouTube Automation',
  'Technology & Engineering',
  'Design & Creative',
  'Sales & Business Development',
  'Customer Support',
  'Finance & Accounting',
  'Content & Writing',
  'Education & Training',
  'Healthcare',
  'Legal',
  'Other',
];

const JOB_TYPES: JobType[] = ['Full-time', 'Part-time', 'Contract', 'Freelance'];
const WORK_SETUPS: WorkSetup[] = ['Remote', 'On-site', 'Hybrid'];
const CAREER_LEVELS: CareerLevel[] = ['Entry', 'Mid', 'Senior', 'Executive'];

const SALARY_RANGES = [
  { label: 'Below 20,000', min: 0, max: 20000 },
  { label: '20,000 – 40,000', min: 20000, max: 40000 },
  { label: '40,000 – 60,000', min: 40000, max: 60000 },
  { label: '60,000 – 80,000', min: 60000, max: 80000 },
  { label: '80,000 – 100,000', min: 80000, max: 100000 },
  { label: '100,000 – 120,000', min: 100000, max: 120000 },
  { label: '120,000 – 150,000', min: 120000, max: 150000 },
  { label: 'Above 150,000', min: 150000, max: Infinity },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Advertising & Marketing': 'bg-purple-100 text-purple-700',
  'YouTube Automation': 'bg-red-100 text-red-700',
  'Technology & Engineering': 'bg-blue-100 text-blue-700',
  'Design & Creative': 'bg-pink-100 text-pink-700',
  'Sales & Business Development': 'bg-orange-100 text-orange-700',
  'Customer Support': 'bg-teal-100 text-teal-700',
  'Finance & Accounting': 'bg-green-100 text-green-700',
  'Content & Writing': 'bg-amber-100 text-amber-700',
  'Education & Training': 'bg-indigo-100 text-indigo-700',
  'Healthcare': 'bg-emerald-100 text-emerald-700',
  'Legal': 'bg-slate-100 text-slate-700',
  'Other': 'bg-gray-100 text-gray-600',
};

const FEATURED_CATEGORIES = [
  { name: 'Advertising & Marketing', icon: Megaphone, color: 'from-purple-500 to-purple-700' },
  { name: 'YouTube Automation', icon: Star, color: 'from-red-500 to-red-700' },
  { name: 'Technology & Engineering', icon: TrendingUp, color: 'from-blue-500 to-blue-700' },
  { name: 'Content & Writing', icon: Briefcase, color: 'from-amber-500 to-amber-700' },
];

type SortOption = 'newest' | 'oldest' | 'salary_high' | 'salary_low';
type DateFilter = 'all' | 'today' | 'week' | 'month';

interface Filters {
  search: string;
  categories: string[];
  jobTypes: JobType[];
  workSetups: WorkSetup[];
  careerLevels: CareerLevel[];
  salaryRange: { min: number; max: number } | null;
  region: string;
  datePosted: DateFilter;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  categories: [],
  jobTypes: [],
  workSetups: [],
  careerLevels: [],
  salaryRange: null,
  region: '',
  datePosted: 'all',
};

function JobCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-xl" />
        <div className="w-6 h-6 bg-gray-200 rounded" />
      </div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
      <div className="flex gap-2 mb-3">
        <div className="h-6 w-20 bg-gray-200 rounded-full" />
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-4" />
      <div className="h-9 bg-gray-200 rounded-xl" />
    </div>
  );
}

function JobCard({ job, saved, onToggleSave }: { job: Job; saved: boolean; onToggleSave: (id: string) => void }) {
  const daysUntilDeadline = job.application_deadline
    ? Math.ceil((new Date(job.application_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  const isExpired = daysUntilDeadline !== null && daysUntilDeadline < 0;

  const categoryColor = CATEGORY_COLORS[(job.category ?? "")] || CATEGORY_COLORS['Other'];
  const initials = job.company_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 font-bold text-primary-700 text-sm">
          {initials}
        </div>
        <button
          onClick={() => onToggleSave(job.id)}
          className="text-gray-400 hover:text-primary-600 transition-colors p-1 -mr-1"
          title={saved ? 'Unsave job' : 'Save job'}
        >
          {saved ? <BookmarkCheck className="w-5 h-5 text-primary-600" /> : <Bookmark className="w-5 h-5" />}
        </button>
      </div>

      <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 group-hover:text-primary-700 transition-colors line-clamp-2">
        {job.title}
      </h3>
      <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
        <Building2 className="w-3 h-3 shrink-0" /> {job.company_name}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor}`}>
          {(job.category ?? "")}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {(job.job_type ?? "")}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {(job.work_setup ?? "")}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-gray-500 mb-4">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-success shrink-0" />
          <span className="font-medium text-gray-700">{formatSalaryRange((((job.salary_min ?? 0) ?? 0)), (((job.salary_max ?? 0) ?? 0)), job.salary_currency)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" /> {job.region ?? ""}
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" /> {(job.career_level ?? "")} level
        </div>
        {job.application_deadline && (
          <div className={`flex items-center gap-1.5 ${isUrgent ? 'text-warning font-medium' : isExpired ? 'text-error' : ''}`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {isExpired ? 'Deadline passed' : isUrgent ? `Closing in ${daysUntilDeadline}d` : `Deadline: ${new Date(job.application_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </div>
        )}
      </div>

      <Link
        to={`/jobs/${job.id}`}
        className="block w-full text-center bg-primary-50 hover:bg-primary-600 text-primary-700 hover:text-white font-medium rounded-xl py-2 text-sm transition-all"
      >
        View Details
      </Link>
    </motion.div>
  );
}

export default function JobBoardPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('saved_jobs') || '[]')); }
    catch { return new Set(); }
  });
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => { fetchJobs(); }, []);

  const fetchJobs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (data) {
      setJobs(data as Job[]);
      setTotalCount(data.length);
    }
    setLoading(false);
  };

  const toggleSave = (id: string) => {
    setSavedJobs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('saved_jobs', JSON.stringify([...next]));
      return next;
    });
  };

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = <T,>(key: keyof Filters, value: T) => {
    setFilters(prev => {
      const current = prev[key] as T[];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.categories.length) count++;
    if (filters.jobTypes.length) count++;
    if (filters.workSetups.length) count++;
    if (filters.careerLevels.length) count++;
    if (filters.salaryRange) count++;
    if (filters.region) count++;
    if (filters.datePosted !== 'all') count++;
    return count;
  }, [filters]);

  const filteredJobs = useMemo(() => {
    let result = jobs.filter(job => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchSearch = job.title.toLowerCase().includes(q) ||
          job.company_name.toLowerCase().includes(q) ||
          job.description.toLowerCase().includes(q) ||
          (job.category ?? "").toLowerCase().includes(q) ||
          (job.region ?? "").toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      if (filters.categories.length && !filters.categories.includes((job.category ?? ""))) return false;
      if (filters.jobTypes.length && !filters.jobTypes.includes((job.job_type ?? ""))) return false;
      if (filters.workSetups.length && !filters.workSetups.includes((job.work_setup ?? ""))) return false;
      if (filters.careerLevels.length && !filters.careerLevels.includes((job.career_level ?? ""))) return false;

      if (filters.region) {
        if (!(job.region ?? "").toLowerCase().includes(filters.region.toLowerCase())) return false;
      }

      if (filters.salaryRange) {
        const { min, max } = filters.salaryRange;
        if ((job.salary_max ?? 0) < min || (max !== Infinity && (job.salary_min ?? 0) > max)) return false;
      }

      if (filters.datePosted !== 'all') {
        const posted = new Date(job.created_at);
        const now = new Date();
        const diff = (now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24);
        if (filters.datePosted === 'today' && diff > 1) return false;
        if (filters.datePosted === 'week' && diff > 7) return false;
        if (filters.datePosted === 'month' && diff > 30) return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'salary_high') return (b.salary_max ?? 0) - (a.salary_max ?? 0);
      if (sortBy === 'salary_low') return (a.salary_min ?? 0) - (b.salary_min ?? 0);
      return 0;
    });

    return result;
  }, [jobs, filters, sortBy]);

  const FilterPanel = () => (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
            placeholder="Job title, company, keyword..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
          />
        </div>
      </div>

      {/* Region */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filters.region}
            onChange={e => updateFilter('region', e.target.value)}
            placeholder="City, country, or Remote"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</label>
        <div className="space-y-1.5">
          {JOB_CATEGORIES.map(cat => (
            <label key={cat} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.categories.includes(cat)}
                onChange={() => toggleArrayFilter('categories', cat)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{cat}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Job Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job Type</label>
        <div className="space-y-1.5">
          {JOB_TYPES.map(type => (
            <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.jobTypes.includes(type)}
                onChange={() => toggleArrayFilter('jobTypes', type)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Work Setup */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Work Setup</label>
        <div className="space-y-1.5">
          {WORK_SETUPS.map(setup => (
            <label key={setup} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.workSetups.includes(setup)}
                onChange={() => toggleArrayFilter('workSetups', setup)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{setup}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Career Level */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Career Level</label>
        <div className="space-y-1.5">
          {CAREER_LEVELS.map(level => (
            <label key={level} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.careerLevels.includes(level)}
                onChange={() => toggleArrayFilter('careerLevels', level)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{level}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Salary Range */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Salary Range</label>
        <div className="space-y-1.5">
          {SALARY_RANGES.map(range => (
            <label key={range.label} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name="salary"
                checked={filters.salaryRange?.min === range.min && filters.salaryRange?.max === range.max}
                onChange={() => updateFilter('salaryRange', { min: range.min, max: range.max })}
                className="border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{range.label}</span>
            </label>
          ))}
          {filters.salaryRange && (
            <button onClick={() => updateFilter('salaryRange', null)} className="text-xs text-primary-600 hover:underline mt-1">
              Clear salary filter
            </button>
          )}
        </div>
      </div>

      {/* Date Posted */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date Posted</label>
        <div className="space-y-1.5">
          {([['all', 'Any time'], ['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']] as const).map(([val, label]) => (
            <label key={val} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name="datePosted"
                checked={filters.datePosted === val}
                onChange={() => updateFilter('datePosted', val)}
                className="border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="w-full flex items-center justify-center gap-2 bg-error-muted text-error rounded-xl py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
        >
          <X className="w-4 h-4" /> Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-700 via-primary-600 to-indigo-700 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Find Your Next Opportunity</h1>
            <p className="text-primary-200 mb-6">Browse {totalCount}+ jobs across all categories. Applications are always free.</p>
          </motion.div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 mb-6 text-sm text-primary-200">
            <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> {totalCount} Active Jobs</span>
            <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" /> Multiple Companies</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Nigeria & Remote</span>
          </div>

          {/* Featured category pills */}
          <div className="flex flex-wrap gap-2">
            {FEATURED_CATEGORIES.map(cat => (
              <button
                key={cat.name}
                onClick={() => updateFilter('categories', filters.categories.includes(cat.name) ? [] : [cat.name])}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  filters.categories.includes(cat.name)
                    ? 'bg-white text-primary-700 shadow-md'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm sticky top-4">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary-600" /> Filters
                  {activeFilterCount > 0 && (
                    <span className="text-xs font-bold bg-primary-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </h2>
              </div>
              <FilterPanel />
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <p className="text-sm text-gray-600">
                {loading ? 'Loading...' : (
                  <>
                    <span className="font-semibold text-gray-900">{filteredJobs.length}</span>
                    {` job${filteredJobs.length !== 1 ? 's' : ''} found`}
                    {activeFilterCount > 0 && <span className="text-primary-600"> (filtered)</span>}
                  </>
                )}
              </p>

              <div className="flex items-center gap-2">
                {/* Mobile filter button */}
                <button
                  onClick={() => setFilterDrawerOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Filter className="w-4 h-4" /> Filters
                  {activeFilterCount > 0 && (
                    <span className="text-xs font-bold bg-primary-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Sort */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortOption)}
                    className="appearance-none pl-3 pr-8 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none cursor-pointer"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="salary_high">Salary: High to Low</option>
                    <option value="salary_low">Salary: Low to High</option>
                  </select>
                  <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>

                {/* View toggle */}
                <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                <Link
                  to="/post-job"
                  className="hidden sm:inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-4 py-2 text-sm transition-colors"
                >
                  <Briefcase className="w-4 h-4" /> Post a Job
                </Link>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {filters.categories.map(cat => (
                  <span key={cat} className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 rounded-full px-3 py-1">
                    {cat}
                    <button onClick={() => toggleArrayFilter('categories', cat)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {filters.jobTypes.map(t => (
                  <span key={t} className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 rounded-full px-3 py-1">
                    {t}<button onClick={() => toggleArrayFilter('jobTypes', t)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {filters.workSetups.map(s => (
                  <span key={s} className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 rounded-full px-3 py-1">
                    {s}<button onClick={() => toggleArrayFilter('workSetups', s)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {filters.careerLevels.map(l => (
                  <span key={l} className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 rounded-full px-3 py-1">
                    {l}<button onClick={() => toggleArrayFilter('careerLevels', l)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {filters.salaryRange && (
                  <span className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 rounded-full px-3 py-1">
                    Salary filtered<button onClick={() => updateFilter('salaryRange', null)}><X className="w-3 h-3" /></button>
                  </span>
                )}
                <button onClick={clearFilters} className="text-xs text-error hover:underline px-2">Clear all</button>
              </div>
            )}

            {loading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>
                {Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}
              </div>
            ) : filteredJobs.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No jobs match your filters</h3>
                <p className="text-gray-500 text-sm mb-4">Try adjusting your search criteria or clearing filters</p>
                <button onClick={clearFilters} className="bg-primary-600 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors">
                  Clear Filters
                </button>
              </motion.div>
            ) : viewMode === 'grid' ? (
              <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredJobs.map(job => (
                    <JobCard key={job.id} job={job} saved={savedJobs.has(job.id)} onToggleSave={toggleSave} />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div layout className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {filteredJobs.map(job => (
                    <motion.div
                      key={job.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 font-bold text-primary-700 text-sm">
                        {job.company_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link to={`/jobs/${job.id}`} className="font-semibold text-gray-900 hover:text-primary-700 transition-colors text-sm">
                              {job.title}
                            </Link>
                            <p className="text-xs text-gray-500 mt-0.5">{job.company_name} · {job.region ?? ""}</p>
                          </div>
                          <span className="text-sm font-semibold text-success shrink-0">
                            {formatSalaryRange((((job.salary_min ?? 0) ?? 0)), (((job.salary_max ?? 0) ?? 0)), job.salary_currency)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[(job.category ?? "")] || CATEGORY_COLORS['Other']}`}>{(job.category ?? "")}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{(job.job_type ?? "")}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{(job.work_setup ?? "")}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{(job.career_level ?? "")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleSave(job.id)} className="text-gray-400 hover:text-primary-600 transition-colors">
                          {savedJobs.has(job.id) ? <BookmarkCheck className="w-4 h-4 text-primary-600" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                        <Link to={`/jobs/${job.id}`} className="bg-primary-50 hover:bg-primary-600 text-primary-700 hover:text-white text-xs font-medium rounded-xl px-3 py-2 transition-all whitespace-nowrap">
                          View
                        </Link>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Post CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-10 bg-gradient-to-br from-primary-600 to-indigo-700 rounded-2xl p-6 text-white text-center"
            >
              <Briefcase className="w-8 h-8 mx-auto mb-3 text-primary-200" />
              <h3 className="text-lg font-bold mb-1">Hiring? Post a Job for Free</h3>
              <p className="text-primary-200 text-sm mb-4">Reach thousands of qualified candidates. Job postings are completely free.</p>
              <button
                onClick={() => navigate('/post-job')}
                className="bg-white text-primary-700 font-semibold rounded-xl px-6 py-2.5 hover:bg-primary-50 transition-colors"
              >
                Post a Job Ad
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      <AnimatePresence>
        {filterDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilterDrawerOpen(false)}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-80 max-w-full bg-white z-50 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary-600" /> Filters
                </h2>
                <button onClick={() => setFilterDrawerOpen(false)} className="p-2 text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <FilterPanel />
                <button
                  onClick={() => setFilterDrawerOpen(false)}
                  className="w-full mt-4 bg-primary-600 text-white font-medium rounded-xl py-3 hover:bg-primary-700 transition-colors"
                >
                  Show {filteredJobs.length} Results
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NapFooter />
    </div>
  );
}
