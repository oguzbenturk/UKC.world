import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

export const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr', 'ru', 'es', 'de'];
export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'plannivo.lang';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    load: 'languageOnly',
    ns: ['common', 'errors', 'public', 'outsider', 'student', 'instructor', 'manager', 'admin'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnEmptyString: false,
    react: {
      useSuspense: false,
    },
  });

export default i18n;
