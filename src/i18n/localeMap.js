import enUS from 'antd/locale/en_US';
import trTR from 'antd/locale/tr_TR';
import frFR from 'antd/locale/fr_FR';
import ruRU from 'antd/locale/ru_RU';
import esES from 'antd/locale/es_ES';

import 'dayjs/locale/en';
import 'dayjs/locale/tr';
import 'dayjs/locale/fr';
import 'dayjs/locale/ru';
import 'dayjs/locale/es';

export const ANTD_LOCALES = {
  en: enUS,
  tr: trTR,
  fr: frFR,
  ru: ruRU,
  es: esES,
};

export const DAYJS_LOCALES = {
  en: 'en',
  tr: 'tr',
  fr: 'fr',
  ru: 'ru',
  es: 'es',
};

export const resolveAntdLocale = (code) => ANTD_LOCALES[code] || ANTD_LOCALES.en;
export const resolveDayjsLocale = (code) => DAYJS_LOCALES[code] || DAYJS_LOCALES.en;
