import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { APP_VERSION } from '@/shared/constants/version';

export const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr', 'ru', 'es', 'de'];
export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'plannivo.lang';

export const i18nReady = i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    load: 'languageOnly',
    ns: ['common', 'errors', 'public', 'outsider', 'student', 'instructor', 'manager', 'admin', 'proposal'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    backend: {
      // The version query busts browser/proxy caches of the JSON on every deploy;
      // otherwise a release that adds keys shows raw "namespace.key" text until the
      // cached file expires.
      loadPath: `/locales/{{lng}}/{{ns}}.json?v=${APP_VERSION}`,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnEmptyString: false,
    react: {
      useSuspense: true,
    },
  });

export default i18n;
