import { useEffect, useMemo, useState } from 'react';
import i18n from '@/i18n';

// Returns a fixed-language translator for the `proposal` namespace in the chosen
// OUTPUT language (which may differ from the staff UI language). Ensures the
// namespace + language are loaded, then re-renders so labels resolve.
export function useProposalLabels(lang = 'en') {
  const [, force] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      i18n.loadNamespaces('proposal'),
      i18n.loadLanguages(lang),
    ])
      .then(() => { if (active) force((n) => n + 1); })
      .catch(() => { /* labels fall back to keys/en */ });
    return () => { active = false; };
  }, [lang]);

  return useMemo(() => i18n.getFixedT(lang, 'proposal'), [lang]);
}

// Promise-based variant for the async PDF generator.
export async function loadProposalLabels(lang = 'en') {
  try {
    await Promise.all([i18n.loadNamespaces('proposal'), i18n.loadLanguages(lang)]);
  } catch { /* fall back */ }
  return i18n.getFixedT(lang, 'proposal');
}
