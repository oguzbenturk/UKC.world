import { TeamOutlined } from '@ant-design/icons';
import FamilyManagement from '../components/FamilyManagement';
import { useAuth } from '@/shared/hooks/useAuth';
import { setDocumentTitle, setMetaTag, setOgTag, setLinkTag } from '@/shared/utils/seo';

const FamilyManagementPage = () => {
  const { user } = useAuth();
  const userId = user?.id;

  // Set SEO metadata for this page (imperatively)
  setDocumentTitle('Family Members • Plannivo');
  setMetaTag('description', 'Manage your family members (under 18) to book lessons and rentals and complete waivers.');
  setOgTag('og:title', 'Family Members • Plannivo');
  setOgTag('og:description', 'Manage your family members (under 18) to book lessons and rentals and complete waivers.');
  setOgTag('og:url', (typeof window !== 'undefined' ? window.location.origin : 'https://plannivo.com') + '/student/family');
  setLinkTag('canonical', '/student/family');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
            <TeamOutlined className="text-xl" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Family Members
          </h1>
        </div>
        <p className="ml-13 text-slate-500 dark:text-slate-400">
          Add and manage your children's profiles for bookings and waivers.
        </p>
      </div>
      
      <FamilyManagement userId={userId} />
    </div>
  );
};

export default FamilyManagementPage;
