import { Card, Typography, Empty, Button } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * EventsViewPage - Read-only events overview page
 */
const EventsViewPage = () => {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 p-6 text-white shadow-lg">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <CalendarOutlined /> Events Overview
          </div>
          <h1 className="text-3xl font-semibold">Events</h1>
          <p className="text-sm text-white/75">
            View upcoming and past events without configuration controls.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <Empty
          image={<CalendarOutlined className="text-6xl text-slate-300" />}
          description={
            <div className="space-y-2">
              <Text className="text-slate-500">No events to display</Text>
              <p className="text-xs text-slate-400">
                Events will appear here once scheduled.
              </p>
            </div>
          }
        >
          <Button type="default" disabled>
            View Events
          </Button>
        </Empty>
      </Card>
    </div>
  );
};

export default EventsViewPage;
