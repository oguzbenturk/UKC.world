import PropTypes from 'prop-types';
import { Card, Empty, List, Space, Tag, Typography } from 'antd';
import { formatDistanceToNow, parseISO } from 'date-fns';

const { Paragraph, Text } = Typography;

const formatTimestamp = (isoString) => {
  if (!isoString) return 'Recently updated';
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    return 'Recently updated';
  }
};

const NoteItem = ({ note }) => (
  <List.Item key={note.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700">
    <Space direction="vertical" size={4} className="w-full">
      <Space className="w-full" align="center" justify="space-between">
        <Space size={8} align="center">
          {note.isPinned && <Tag color="gold">Pinned</Tag>}
          <Text strong>{note.instructor?.name ?? 'Instructor'}</Text>
        </Space>
        <Text type="secondary" className="text-xs">
          {formatTimestamp(note.updatedAt || note.createdAt)}
        </Text>
      </Space>
      <Paragraph style={{ marginBottom: 0 }}>{note.note}</Paragraph>
    </Space>
  </List.Item>
);

NoteItem.propTypes = {
  note: PropTypes.shape({
    id: PropTypes.string.isRequired,
    note: PropTypes.string.isRequired,
    instructor: PropTypes.shape({
      name: PropTypes.string
    }),
    isPinned: PropTypes.bool,
    createdAt: PropTypes.string,
    updatedAt: PropTypes.string
  }).isRequired
};

const InstructorNotesPanel = ({ notes = [] }) => {
  const visibleNotes = notes.filter((note) => (note.visibility || 'student_visible') !== 'instructor_only');
  const pinnedNotes = visibleNotes.filter((note) => note.isPinned);
  const recentNotes = visibleNotes.filter((note) => !note.isPinned);

  const hasPinned = pinnedNotes.length > 0;
  const hasRecent = recentNotes.length > 0;
  const hasAnyNotes = hasPinned || hasRecent;

  return (
    <Card className="shadow-sm" title="Instructor notes" extra={<Text type="secondary">Private feedback just for you</Text>}>
      {!hasAnyNotes ? (
        <Empty description="Once instructors leave feedback, it will appear here" />
      ) : (
        <Space direction="vertical" size={16} className="w-full">
          {hasPinned && (
            <div>
              <Text strong>Pinned highlights</Text>
              <List
                dataSource={pinnedNotes}
                renderItem={(note) => <NoteItem key={`pinned-${note.id}`} note={note} />}
                className="mt-3"
                split={false}
              />
            </div>
          )}

          {hasRecent && (
            <div>
              <Text strong>Recent updates</Text>
              <List
                dataSource={recentNotes.slice(0, 4)}
                renderItem={(note) => <NoteItem key={`recent-${note.id}`} note={note} />}
                className="mt-3"
                split={false}
              />
            </div>
          )}
        </Space>
      )}
    </Card>
  );
};

InstructorNotesPanel.propTypes = {
  notes: PropTypes.arrayOf(NoteItem.propTypes.note)
};

export default InstructorNotesPanel;
