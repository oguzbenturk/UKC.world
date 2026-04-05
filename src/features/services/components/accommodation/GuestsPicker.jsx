import { useState } from 'react';
import { Popover, Button } from 'antd';

export default function GuestsPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const guests = value || { adults: 2, children: 0, rooms: 1 };

  const set = (field, delta) => {
    const next = { ...guests, [field]: Math.max(0, (guests[field] || 0) + delta) };
    if (field === 'adults' && next.adults < 1) next.adults = 1;
    if (field === 'rooms' && next.rooms < 1) next.rooms = 1;
    onChange?.(next);
  };

  const content = (
    <div className="space-y-2 w-64">
      {['adults', 'children', 'rooms'].map((k) => (
        <div className="flex items-center justify-between" key={k}>
          <span className="capitalize text-sm">{k}</span>
          <div className="flex items-center gap-2">
            <Button size="small" onClick={() => set(k, -1)}>-</Button>
            <span className="w-6 text-center">{guests[k]}</span>
            <Button size="small" onClick={() => set(k, 1)}>+</Button>
          </div>
        </div>
      ))}
      <div className="text-right">
        <Button type="primary" size="small" onClick={() => setOpen(false)}>Done</Button>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomLeft">
      <Button className="h-10">
        {guests.adults} Adults · {guests.children} Children · {guests.rooms} Room{guests.rooms > 1 ? 's' : ''}
      </Button>
    </Popover>
  );
}
