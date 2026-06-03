// Embeds a Unicode TTF into a jsPDF doc at runtime so all 6 languages render
// correctly (no transliteration). Poppins covers Latin + Turkish; Russian
// (Cyrillic) uses Noto Sans. Only the family needed for the chosen language is
// embedded, to keep the PDF small. Fetched buffers are cached per session.

const FONT_FILES = {
  poppins: { regular: '/fonts/Poppins-Regular.ttf', bold: '/fonts/Poppins-Bold.ttf', family: 'Poppins' },
  noto: { regular: '/fonts/NotoSans-Regular.ttf', bold: '/fonts/NotoSans-Bold.ttf', family: 'NotoSans' },
};

const familyForLang = (lang) => (lang === 'ru' ? 'noto' : 'poppins');

const base64Cache = {};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchFontBase64(url) {
  if (base64Cache[url]) return base64Cache[url];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  const buf = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  base64Cache[url] = b64;
  return b64;
}

/**
 * Embed the right font family for `lang` and return its jsPDF family name.
 * Falls back to Helvetica (returns 'helvetica') if fetching fails.
 */
export async function embedProposalFont(doc, lang = 'en') {
  const cfg = FONT_FILES[familyForLang(lang)];
  try {
    const [reg, bold] = await Promise.all([
      fetchFontBase64(cfg.regular),
      fetchFontBase64(cfg.bold),
    ]);
    const regFile = `${cfg.family}-Regular.ttf`;
    const boldFile = `${cfg.family}-Bold.ttf`;
    doc.addFileToVFS(regFile, reg);
    doc.addFont(regFile, cfg.family, 'normal');
    doc.addFileToVFS(boldFile, bold);
    doc.addFont(boldFile, cfg.family, 'bold');
    return cfg.family;
  } catch (e) {
    // Latin-only fallback; non-ASCII may not render but PDF still builds.
    // eslint-disable-next-line no-console
    console.warn('Proposal font embed failed, falling back to Helvetica:', e?.message || e);
    return 'helvetica';
  }
}
