import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase, MapPin, Building2, Users, ArrowRight,
} from 'lucide-react';
import type { ProfileJob } from './profileTypes';

interface EmployerProfileProps {
  jobs: ProfileJob[];
  companyName: string | null;
  storeDescription: string | null;
  storeLocation: string | null;
  avatarUrl: string | null;
}

export function EmployerProfile({ jobs, companyName, storeDescription, storeLocation, avatarUrl }: EmployerProfileProps) {
  const activeJobs = jobs;

  return (
    <div className="space-y-6">
      {/* Company Info Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="h-20 bg-gradient-to-br from-blue-500 to-indigo-600" />
        <div className="p-5 sm:p-6 -mt-10">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 ring-4 ring-white dark:ring-gray-900 overflow-hidden shrink-0 shadow-md">
              {avatarUrl ? (
                <img src={avatarUrl} alt={companyName || 'Company'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-500">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {companyName || 'Company'}
              </h3>
              {storeLocation && (
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4" /> {storeLocation}
                </p>
              )}
              {storeDescription && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{storeDescription}</p>
              )}
            </div>
          </div>

          {/* Company Stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
              <Briefcase className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{activeJobs.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active Jobs</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
              <Users className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {activeJobs.reduce((sum, j) => sum + (j.total_applications || 0), 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Applicants</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-center">
              <Building2 className="w-4 h-4 text-purple-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">Hiring</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Jobs */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Open Positions</h3>
        {activeJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
              <Briefcase className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">No active job postings</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
              >
                <Link
                  to={`/jobs/${job.id}`}
                  className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                        {job.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {job.category && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            {job.category}
                          </span>
                        )}
                        {job.job_type && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {job.job_type}
                          </span>
                        )}
                        {job.work_setup && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {job.work_setup}
                          </span>
                        )}
                        {job.region && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {job.region}
                          </span>
                        )}
                      </div>
                      {(job.salary_min || job.salary_max) && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          Salary: {job.salary_currency || '$'}
                          {job.salary_min ? job.salary_min.toLocaleString() : '—'}
                          {job.salary_max && ` - ${job.salary_max.toLocaleString()}`}
                        </p>
                      )}
                      {job.total_applications !== undefined && job.total_applications > 0 && (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {job.total_applications} {job.total_applications === 1 ? 'applicant' : 'applicants'}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all shrink-0" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
