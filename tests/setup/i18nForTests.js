/**
 * Real English i18next instance for component tests.
 *
 * Components were migrated to react-i18next; without an initialised instance
 * `t()` returns raw keys (e.g. "common:dashboard.settings") and text-based
 * assertions fail. Importing this module (side effect) initialises i18next
 * synchronously with the shipped `public/locales/en/*.json` resources, so tests
 * keep asserting on the real UI copy.
 *
 * Usage (before importing the component under test):
 *   import '../../../setup/i18nForTests';
 */
import fs from 'fs';
import path from 'path';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const NAMESPACES = ['common', 'errors', 'public', 'outsider', 'student', 'instructor', 'manager', 'admin', 'proposal'];
const localesDir = path.resolve(process.cwd(), 'public/locales/en');

const en = {};
for (const ns of NAMESPACES) {
  const file = path.join(localesDir, `${ns}.json`);
  if (fs.existsSync(file)) {
    en[ns] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: NAMESPACES,
    defaultNS: 'common',
    resources: { en },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    initImmediate: false,
    react: { useSuspense: false },
  });
}

export default i18n;
