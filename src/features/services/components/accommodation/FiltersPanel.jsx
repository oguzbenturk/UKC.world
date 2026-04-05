import { useState } from 'react';
import { Card, Slider, Checkbox, Rate, Button, Drawer } from 'antd';

const AMENITIES = ['Wi-Fi', 'Breakfast', 'Pool', 'Parking', 'Gym', 'Airport Shuttle'];

export default function FiltersPanel({ value, onChange, mobile = false, open, onClose }) {
  const [filters, setFilters] = useState(value || { price: [0, 500], rating: 0, amenities: [] });

  const update = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange?.(next);
  };

  const content = (
    <div className="space-y-4">
      <Card size="small" title="Price per night">
        <Slider range min={0} max={1000} step={10} value={filters.price} onChange={(v) => update({ price: v })} />
      </Card>
      <Card size="small" title="Guest rating">
        <Rate value={filters.rating} onChange={(v) => update({ rating: v })} allowClear />
      </Card>
      <Card size="small" title="Amenities">
        <Checkbox.Group
          options={AMENITIES}
          value={filters.amenities}
          onChange={(v) => update({ amenities: v })}
        />
      </Card>
      <div className="flex gap-2">
        <Button onClick={() => update({ price: [0, 500], rating: 0, amenities: [] })}>Clear</Button>
        <Button type="primary" onClick={onClose}>Apply</Button>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <Drawer title="Filters" open={open} onClose={onClose}>
        {content}
      </Drawer>
    );
  }

  return <div className="sticky top-4">{content}</div>;
}
