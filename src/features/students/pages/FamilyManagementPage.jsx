import { useTranslation } from 'react-i18next';
import { TeamOutlined } from '@ant-design/icons';
import FamilyManagement from '../components/FamilyManagement';
import { useAuth } from '@/shared/hooks/useAuth';
import { setDocumentTitle, setMetaTag, setOgTag, setLinkTag } from '@/shared/utils/seo';

const FamilyManagementPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation(['student']);
  const userId = user?.id;

  // Set SEO metadata for this page (imperatively)
  setDocumentTitle(t('student:family.seoTitle'));
  setMetaTag('description', t('student:family.seoDescription'));
  setOgTag('og:title', t('student:family.seoTitle'));
  setOgTag('og:description', t('student:family.seoDescription'));
  setOgTag('og:url', (typeof window !== 'undefined' ? window.location.origin : 'https://ukc.plannivo.com') + '/student/family');
  setLinkTag('canonical', '/student/family');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
            <TeamOutlined className="text-xl" />
          </div>
          <h1 className="text-2xl font-duotone-bold-extended text-slate-900 dark:text-white">
            {t('student:family.pageTitle')}
          </h1>
        </div>
        <p className="ml-13 text-slate-500 dark:text-slate-400">
          {t('student:family.pageSubtitle')}
        </p>
      </div>

      <FamilyManagement userId={userId} />
    </div>
  );
};

export default FamilyManagementPage;
