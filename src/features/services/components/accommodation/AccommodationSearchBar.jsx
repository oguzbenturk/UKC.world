import { useState } from 'react';
import { DatePicker, Input, Button, Card } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import GuestsPicker from './GuestsPicker';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function AccommodationSearchBar({ value, onChange, onSubmit }) {
  const [state, setState] = useState(
    value || {
      location: '',
      dates: [dayjs().add(1, 'day'), dayjs().add(3, 'day')],
      guests: { adults: 2, children: 0, rooms: 1 },
      keyword: ''
    }
  );

  const set = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange?.(next);
  };

  return (
    <Card className="shadow-sm border-0 rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
        <Input
          size="large"
          placeholder="Destination or property name"
          value={state.location}
          onChange={(e) => set({ location: e.target.value })}
        />
        <RangePicker
          size="large"
          value={state.dates}
          onChange={(v) => set({ dates: v })}
          className="w-full"
          allowClear={false}
        />
        <GuestsPicker value={state.guests} onChange={(v) => set({ guests: v })} />
        <Button type="primary" size="large" icon={<SearchOutlined />} onClick={() => onSubmit?.(state)}>
          Search Availability
        </Button>
      </div>
    </Card>
  );
}
