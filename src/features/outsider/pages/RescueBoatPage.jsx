/**
 * RescueBoatPage — public, customer-facing entry point for the Rescue service.
 *
 * Rescue is a DISCIPLINE (internal tag 'rescue_boat', label "🚤 Rescue").
 * Rescue services have category='lesson', discipline_tag='rescue_boat'.
 * Customers with an ACTIVE membership get services.member_discount_percent off
 * (default 50). This page is intentionally simple and robust: it fetches the
 * public GET /api/services list, filters to discipline_tag === 'rescue_boat',
 * and renders each as a card with name, price and a "⭐ Members X% off" badge.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/shared/services/apiClient';
import { usePageSEO } from '@/shared/utils/seo';

// Owner-approved placeholder image reused from another guest card.
const RESCUE_PLACEHOLDER = '/Images/guest/Efoilassist.jpg';
const ACCENT = '#06b6d4';

const formatPrice = (service) => {
  const eur = Array.isArray(service.prices)
    ? service.prices.find((p) => (p.currencyCode || '').toUpperCase() === 'EUR')
    : null;
  const amount = eur ? eur.price : service.price;
  const num = parseFloat(amount);
  if (!Number.isFinite(num)) return null;
  const symbol = eur ? '€' : (service.currencySymbol || '€');
  return `${symbol}${num.toFixed(0)}`;
};

const RescueCard = ({ service }) => {
  const { t } = useTranslation(['outsider']);
  const price = formatPrice(service);
  const memberPct = service.memberDiscountPercent;
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{
        border: '1px solid rgba(75,79,84,0.12)',
        boxShadow: '0 4px 20px rgba(75,79,84,0.10)',
        background: '#fff',
      }}
    >
      <div className="relative h-40 overflow-hidden" style={{ background: ACCENT }}>
        <img
          src={service.imageUrl || RESCUE_PLACEHOLDER}
          alt={service.name}
          onError={(e) => { e.currentTarget.src = RESCUE_PLACEHOLDER; }}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to bottom, ${ACCENT}22 0%, ${ACCENT}cc 100%)` }}
        />
        <div className="absolute bottom-3 left-4 right-4">
          <h3
            className="leading-tight"
            style={{
              fontFamily: '"Gotham Medium", sans-serif',
              fontWeight: 600,
              fontSize: '1.25rem',
              color: 'white',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {service.name}
          </h3>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        {service.description ? (
          <p className="text-sm mb-3 flex-1" style={{ color: '#4b4f54' }}>
            {service.description}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center justify-between mt-2">
          {price ? (
            <span
              style={{
                fontFamily: '"Gotham Medium", sans-serif',
                fontWeight: 600,
                fontSize: '1.4rem',
                color: '#0f172a',
              }}
            >
              {price}
            </span>
          ) : (
            <span className="text-sm text-slate-400">
              {t('rescue.priceOnRequest', { defaultValue: 'Price on request' })}
            </span>
          )}

          {memberPct != null && memberPct > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' }}
            >
              {t('rescue.membersBadge', {
                defaultValue: '⭐ Members {{pct}}% off',
                pct: Math.round(memberPct),
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const RescueBoatPage = () => {
  const { t } = useTranslation(['outsider']);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  usePageSEO({
    title: t('rescue.seoTitle', { defaultValue: 'Rescue Boat — Duotone Pro Center Urla' }),
    description: t('rescue.seoDescription', {
      defaultValue: 'On-water rescue boat support. Active members save with a member discount.',
    }),
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await apiClient.get('/services');
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setServices(list.filter((s) => s.disciplineTag === 'rescue_boat'));
      } catch (e) {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <div
        className="px-6 py-12 text-center"
        style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #0e7490 100%)` }}
      >
        <h1
          style={{
            fontFamily: '"Gotham Medium", sans-serif',
            fontWeight: 700,
            fontSize: '2.25rem',
            color: 'white',
            textShadow: '0 2px 12px rgba(0,0,0,0.3)',
          }}
        >
          {t('rescue.title', { defaultValue: '🚤 Rescue Boat' })}
        </h1>
        <p className="mt-2 text-white/90 max-w-xl mx-auto">
          {t('rescue.subtitle', {
            defaultValue: 'On-water rescue and boat support when you need it. Active members enjoy a member discount.',
          })}
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
          </div>
        ) : error ? (
          <p className="text-center text-slate-500">
            {t('rescue.loadError', { defaultValue: 'Could not load rescue services. Please try again later.' })}
          </p>
        ) : services.length === 0 ? (
          <p className="text-center text-slate-500">
            {t('rescue.empty', { defaultValue: 'No rescue services are available right now.' })}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <RescueCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RescueBoatPage;
