import { Drawer, Card, Tag, Button, Radio } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

export default function RoomRateSelectorDrawer({ open, onClose, property, _dates }) {
  const { getCurrencySymbol, businessCurrency } = useCurrency();
  const currencySymbol = getCurrencySymbol(businessCurrency);
  
  if (!property) return null;

  // For now, mock room types/rates from property fields if present
  const rooms = property.rooms || [
    { id: 'std', name: 'Standard Room', capacity: 2, beds: '1 Queen', price: Number(property.fromPrice || 80), amenities: ['Wi‑Fi'] },
    { id: 'dlx', name: 'Deluxe Room', capacity: 3, beds: '1 King', price: Number(property.fromPrice || 120) + 30, amenities: ['Wi‑Fi', 'Breakfast'] },
  ];

  const ratePlans = [
    { code: 'NRF', name: 'Non‑Refundable', policy: 'No cancellation', delta: 0 },
    { code: 'REF', name: 'Free Cancellation', policy: 'Cancel until 48h before', delta: 15 },
    { code: 'BB', name: 'Bed & Breakfast', policy: 'Breakfast included', delta: 20 },
  ];

  return (
    <Drawer title={`Select rooms · ${property.name}`} open={open} onClose={onClose} width={720}>
      <div className="space-y-4">
        {rooms.map((r) => (
          <Card key={r.id} className="shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-gray-500 text-sm">Sleeps {r.capacity} · {r.beds}</div>
                <div className="mt-1 flex gap-1">
                  {r.amenities.map((a) => <Tag key={a}>{a}</Tag>)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">From</div>
                <div className="text-lg font-bold">{currencySymbol}{(r.price).toFixed(0)} <span className="text-sm font-normal text-gray-500">/ night</span></div>
              </div>
            </div>
            <div className="mt-3">
              <Radio.Group>
                {ratePlans.map((rp) => (
                  <div key={`${r.id}-${rp.code}`} className="flex items-center justify-between py-2 border-b last:border-none">
                    <div className="flex items-center gap-2">
                      <Radio value={`${r.id}-${rp.code}`}>{rp.name}</Radio>
                      <Tag color="blue-inverse">{rp.policy}</Tag>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{currencySymbol}{(r.price + rp.delta).toFixed(0)}</div>
                    </div>
                  </div>
                ))}
              </Radio.Group>
            </div>
            <div className="mt-3 text-right">
              <Button type="primary">Select</Button>
            </div>
          </Card>
        ))}
      </div>
    </Drawer>
  );
}
