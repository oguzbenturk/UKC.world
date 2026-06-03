// Helpers for fields that may be a plain string (applies to all languages) OR a
// per-language object { en, tr, fr, de, ru, es }. Port of the Python prototype's tr().

/** Resolve a content field to a string for the given language. */
export const resolveContentValue = (value, lang, fallback = 'en') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value[lang] ?? value[fallback] ?? Object.values(value).find((v) => v) ?? '';
  }
  return value == null ? '' : String(value);
};

/** True if the field is a per-language object. */
export const isMultilang = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Read the text for the active editing language (treats a plain string as shared). */
export const mlText = (value, lang) => {
  if (isMultilang(value)) return value[lang] ?? '';
  return value == null ? '' : String(value);
};

/** Write text for a language, normalizing to a per-language object. Preserves
 *  an existing plain-string value under the provided base language. */
export const setMlText = (value, lang, text, baseLang = 'en') => {
  let obj;
  if (isMultilang(value)) {
    obj = { ...value };
  } else if (value) {
    obj = { [baseLang]: String(value) }; // promote existing string
  } else {
    obj = {};
  }
  if (text === '' || text == null) {
    delete obj[lang];
  } else {
    obj[lang] = text;
  }
  return obj;
};
