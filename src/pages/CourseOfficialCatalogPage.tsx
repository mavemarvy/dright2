import { Link, useParams } from 'react-router-dom';
import PremiumCourseLearningPage from '../components/PremiumCourseLearningPage';
import { officialCourse009018BySlug } from '../data/officialCourses009018';

export default function CourseOfficialCatalogPage() {
  const { courseSlug = '' } = useParams();
  const course = officialCourse009018BySlug.get(courseSlug);

  if (!course) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">DRIGHT Official Courses</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Course workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">This learning route is not part of the current DRIGHT Official Course catalogue.</p>
          <Link to="/dright/store" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-black text-white">Open Official Store</Link>
        </div>
      </div>
    );
  }

  return <PremiumCourseLearningPage config={course} />;
}
