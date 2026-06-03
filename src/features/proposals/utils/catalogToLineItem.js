import { formatMoney } from './money';

// Map a picked catalog entity → a package_items row for the proposal builder.
// Stores a display string (regular/cash) AND numeric _amounts (for auto-calc) AND
// _source provenance. `lang` seeds the multilang `item`/`details` objects.

function detailsForType(type, entity, lang) {
  switch (type) {
    case 'package': {
      const parts = [];
      if (entity.total_hours) parts.push(`${entity.total_hours}h`);
      if (entity.accommodation_nights) parts.push(`${entity.accommodation_nights} nights`);
      if (entity.sessions_count) parts.push(`${entity.sessions_count} sessions`);
      return parts.join('  •  ') || entity.description || '';
    }
    case 'accommodation':
      return entity.type ? `${entity.type}` : (entity.description || '');
    case 'service':
    case 'rental':
    default: {
      const parts = [];
      if (entity.duration) parts.push(`${entity.duration}h`);
      if (entity.category) parts.push(entity.category);
      return parts.join('  •  ') || entity.description || '';
    }
  }
}

export function catalogToLineItem({ type, entity, lang = 'en', currencyCode = 'EUR' }) {
  const name = entity.name || entity.unit_name || entity.title || 'Item';
  const price = Number(
    entity.price ?? entity.price_per_night ?? entity.nightly_rate
    ?? entity.daily_rate ?? entity.rental_price ?? entity.price_per_session ?? 0,
  ) || 0;
  const currency = entity.currency || currencyCode;
  const detail = detailsForType(type, entity, lang);

  return {
    item: { [lang]: name },
    details: detail ? { [lang]: detail } : {},
    regular: formatMoney(price, currency),
    cash: formatMoney(price, currency),
    _source: { type, id: entity.id },
    _amounts: { regular: price, cash: price, currency },
  };
}

/** A blank, manually-entered line item. */
export function blankLineItem(lang = 'en', currencyCode = 'EUR') {
  return {
    item: {},
    details: {},
    regular: '',
    cash: '',
    _source: null,
    _amounts: { regular: 0, cash: 0, currency: currencyCode },
  };
}
