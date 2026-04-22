export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', countryCode: 'GB' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', countryCode: 'TR' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', countryCode: 'FR' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', countryCode: 'RU' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', countryCode: 'ES' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', countryCode: 'DE' },
];

export const getLanguage = (code) =>
  LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
