import { Modal, Image, Tag, Descriptions, Button, Rate } from 'antd';

export default function PropertyDetailModal({ open, onClose, property, onSelectRooms }) {
  if (!property) return null;

  const p = property;
  const images = p.images?.length ? p.images : ['/assets/Images/placeholder-hotel.jpg'];
  const amenities = p.features || p.amenities || ['Free Wi‑Fi', 'Breakfast', 'Parking'];

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">{p.name}</span>
          <Rate disabled value={p.rating || 4} className="text-sm" />
          <span className="text-gray-500 text-sm">{p.location}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        <Button key="rooms" type="primary" onClick={onSelectRooms}>See rooms & rates</Button>,
      ]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Image.PreviewGroup>
            <div className="grid grid-cols-2 gap-2">
              {images.slice(0, 4).map((src) => (
                <Image key={src} src={src} className="h-36 w-full object-cover rounded-md" />
              ))}
            </div>
          </Image.PreviewGroup>
        </div>
        <div>
          <Descriptions bordered size="small" column={1} labelStyle={{ width: 140 }}>
            <Descriptions.Item label="Location">{p.location || '—'}</Descriptions.Item>
            <Descriptions.Item label="Highlights">
              <div className="flex flex-wrap gap-1">
                {(p.badges || ['Free cancellation', 'Breakfast included']).map((b) => (
                  <Tag key={b} color="blue-inverse">{b}</Tag>
                ))}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Amenities">
              <div className="flex flex-wrap gap-1">
                {amenities.map((a) => (
                  <Tag key={a}>{a}</Tag>
                ))}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Policies">Check‑in 14:00 · Check‑out 12:00 · Free cancellation windows vary by rate</Descriptions.Item>
          </Descriptions>
        </div>
      </div>
    </Modal>
  );
}
