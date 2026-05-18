import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiClient from '@/shared/services/apiClient';
import { sanitizeHtml } from '@/shared/utils/sanitizeHtml';
import { usePageSEO } from '@/shared/utils/seo';

const TITLES = {
  kvkk: { tr: 'Kişisel Verilerin Korunması (KVKK)', en: 'Personal Data Protection (KVKK)' },
  gizlilik: { tr: 'Gizlilik Politikası', en: 'Privacy Policy' },
  privacy: { tr: 'Gizlilik Politikası', en: 'Privacy Policy' },
  terms: { tr: 'Hizmet Koşulları', en: 'Terms of Service' },
};

const pickTitle = (slug, lang) => {
  const entry = TITLES[slug] || TITLES.privacy;
  return entry[lang?.startsWith('tr') ? 'tr' : 'en'];
};

const PublicLegalPage = ({ slug = 'privacy' }) => {
  const { i18n } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, doc: null });

  const title = useMemo(() => pickTitle(slug, i18n.language), [slug, i18n.language]);
  const safeHtml = useMemo(
    () => (state.doc?.content ? sanitizeHtml(state.doc.content) : ''),
    [state.doc]
  );

  usePageSEO({
    title: `${title} | UKC. Duotone Pro Center`,
    description: title,
    path: `/${slug}`,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, doc: null });
    apiClient
      .get(`/public/legal-documents/${slug}`)
      .then((res) => {
        if (!cancelled) setState({ loading: false, error: null, doc: res.data });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err?.response?.status === 404 ? 'not_found' : 'fetch_failed',
            doc: null,
          });
        }
      });
    return () => { cancelled = true; };
  }, [slug]);

  const updatedAt = state.doc?.updatedAt
    ? new Date(state.doc.updatedAt).toLocaleDateString(i18n.language || 'tr-TR')
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-slate-900 font-semibold tracking-tight hover:text-sky-700">
            UKC.
          </Link>
          <Link to="/" className="text-sm text-slate-600 hover:text-sky-700">
            ← {i18n.language?.startsWith('tr') ? 'Anasayfa' : 'Home'}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">{title}</h1>
        {state.doc?.version && (
          <p className="text-sm text-slate-500 mb-8">
            {i18n.language?.startsWith('tr') ? 'Sürüm' : 'Version'}: {state.doc.version}
            {updatedAt ? ` · ${i18n.language?.startsWith('tr') ? 'Güncelleme' : 'Updated'}: ${updatedAt}` : ''}
          </p>
        )}

        {state.loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-600" />
          </div>
        )}

        {state.error === 'not_found' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            {i18n.language?.startsWith('tr')
              ? 'Bu belge henüz yayınlanmamış. Lütfen daha sonra tekrar deneyin.'
              : 'This document has not been published yet. Please try again later.'}
          </div>
        )}

        {state.error === 'fetch_failed' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
            {i18n.language?.startsWith('tr')
              ? 'Belge yüklenirken bir hata oluştu.'
              : 'Failed to load the document.'}
          </div>
        )}

        {safeHtml && (
          <article
            className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-a:text-sky-700 prose-h1:hidden"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 text-sm text-slate-500 flex flex-wrap gap-4 justify-between">
          <span>© {new Date().getFullYear()} UKC. · Duotone Pro Center</span>
          <span className="flex gap-4">
            <Link to="/kvkk" className="hover:text-sky-700">KVKK</Link>
            <Link to="/gizlilik" className="hover:text-sky-700">Gizlilik</Link>
            <Link to="/terms" className="hover:text-sky-700">Hizmet Koşulları</Link>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default PublicLegalPage;
