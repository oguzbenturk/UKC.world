import { Card, Image, Tag, Rate, Button } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

function PriceBlock({ price, nights, total, formatCurrency, dualPriceDisplay, dualTotalDisplay }) {
  const nightPrice = dualPriceDisplay || formatCurrency(Number(price));
  return (
    <div className="text-right">
      <div className="text-xs text-gray-500">From</div>
      <div className="text-base font-bold">{nightPrice} <span className="text-sm font-normal text-gray-500">/ night</span></div>
      {nights > 0 && total !== undefined && (
        <div className="text-xs text-gray-500">{dualTotalDisplay || formatCurrency(total)} total · {nights} night{nights > 1 ? 's' : ''}</div>
      )}
    </div>
  );
}

export default function PropertyCard({ property, onView }) {
  const { formatCurrency: fc, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const formatCurrency = fc || ((v) => `€${Number(v).toFixed(0)}`);
  
  const p = property;
  const rawPrice = p.fromPrice ?? p.price ?? 0;
  
  // Calculate converted price
  // Assume property is in business currency (EUR) if not specified
  const baseCurrency = p.currency || businessCurrency || 'EUR';
  const targetCurrency = userCurrency || baseCurrency;
  
  // Convert unit price
  const price = convertCurrency ? convertCurrency(rawPrice, baseCurrency, targetCurrency) : rawPrice;
  
  // Show dual currency when base differs from target
  const showDualCurrency = baseCurrency !== targetCurrency && convertCurrency;
  
  const displayFormat = (val) => formatCurrency(val, targetCurrency);
  
  // Dual display strings
  const dualPriceDisplay = showDualCurrency 
    ? `${formatCurrency(rawPrice, baseCurrency)} / ${formatCurrency(price, targetCurrency)}`
    : null;

  const nights = p.nights || 0;
  // If total is provided, we must convert it too. If calculated, we calculate from converted price.
  const rawTotal = p.total;
  const total = rawTotal !== undefined 
    ? (convertCurrency ? convertCurrency(rawTotal, baseCurrency, targetCurrency) : rawTotal)
    : (nights > 0 ? price * nights : undefined);
  
  const dualTotalDisplay = showDualCurrency && total !== undefined
    ? `${formatCurrency(rawTotal !== undefined ? rawTotal : (nights > 0 ? rawPrice * nights : 0), baseCurrency)} / ${formatCurrency(total, targetCurrency)}`
    : null;

  return (
    <Card hoverable className="rounded-xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <Image.PreviewGroup>
            <Image src={p.images?.[0] || '/assets/Images/placeholder-hotel.jpg'} alt={p.name} className="rounded-lg object-cover h-28 w-full" />
          </Image.PreviewGroup>
        </div>
        <div className="col-span-2 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 line-clamp-1">{p.name}</h3>
            <Rate disabled value={p.rating || 4} className="text-sm" />
          </div>
          <p className="text-gray-500 text-sm line-clamp-1">{p.location || 'Great location'}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(p.badges || ['Free cancellation', 'Breakfast included']).map((b) => (
              <Tag key={b} bordered={false} color="#e6f4ff" className="text-blue-600">{b}</Tag>
            ))}
          </div>
          <div className="mt-auto flex items-end justify-between">
            <PriceBlock 
              price={price} 
              nights={nights} 
              total={total} 
              formatCurrency={displayFormat}
              dualPriceDisplay={dualPriceDisplay}
              dualTotalDisplay={dualTotalDisplay}
            />
            <Button type="primary" onClick={() => onView?.(p)}>See availability</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
