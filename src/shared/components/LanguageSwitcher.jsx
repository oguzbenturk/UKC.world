import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { LANGUAGES, getLanguage } from '@/i18n/languages';

const LanguageSwitcher = ({ variant = 'navbar' }) => {
  const { i18n, t } = useTranslation();
  const current = getLanguage(i18n.resolvedLanguage || i18n.language);

  const items = LANGUAGES.map((lang) => ({
    key: lang.code,
    label: (
      <span className="flex items-center gap-2">
        <span className="text-base leading-none">{lang.flag}</span>
        <span className="text-sm">{lang.nativeName}</span>
      </span>
    ),
    onClick: () => {
      if (lang.code !== i18n.resolvedLanguage) {
        i18n.changeLanguage(lang.code);
      }
    },
  }));

  const triggerClass =
    variant === 'navbar'
      ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#00a8c4]'
      : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-slate-700 hover:bg-slate-100 transition-colors duration-150';

  return (
    <Dropdown
      menu={{ items, selectedKeys: [current.code] }}
      placement="bottomRight"
      trigger={['click']}
    >
      <button
        type="button"
        className={triggerClass}
        aria-label={t('language.change')}
        title={t('language.change')}
      >
        <GlobeAltIcon className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">{current.code.toUpperCase()}</span>
      </button>
    </Dropdown>
  );
};

export default LanguageSwitcher;
