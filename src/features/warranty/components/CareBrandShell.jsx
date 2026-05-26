import React from 'react';
import { Link } from 'react-router-dom';

// Light-mode public shell with the UKC. wordmark + Duotone Pro Center · Urla
// tagline. Mirrors the email header from emailTemplates/brandedLayout.js so a
// customer's emails and the linked page feel like the same product.
export default function CareBrandShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:pt-14">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 h-0.5 w-8 rounded-full bg-emerald-400" />
          <Link to="/care" className="inline-flex items-end gap-1 leading-none">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">UKC</span>
            <span className="mb-[3px] inline-block h-2 w-2 rounded-full bg-emerald-400" />
          </Link>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
            Duotone Pro Center · Urla
          </p>
        </header>

        <main className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          {eyebrow && (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.26em] text-emerald-600">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{subtitle}</p>
          )}
          <div className={title || subtitle ? 'mt-6' : ''}>
            {children}
          </div>
        </main>

        {footer && (
          <footer className="mt-6 text-center text-xs text-slate-500">
            {footer}
          </footer>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Powered by Plannivo · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
