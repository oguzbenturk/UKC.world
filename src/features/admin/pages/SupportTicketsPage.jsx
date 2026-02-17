import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Select,
  message,
  Input,
  Statistic,
  Row,
  Col,
  Typography,
  Collapse
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  SyncOutlined,
  DownOutlined
} from '@ant-design/icons';
import axios from 'axios';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Panel } = Collapse;

const getPriorityColor = (priority) => {
  const colors = {
    urgent: 'red',
    high: 'orange',
    normal: 'blue',
    low: 'default'
  };
  return colors[priority] || 'default';
};

const getStatusColor = (status) => {
  const colors = {
    open: 'orange',
    in_progress: 'blue',
    resolved: 'green',
    closed: 'default'
  };
  return colors[status] || 'default';
};

const getStatusIcon = (status) => {
  const icons = {
    open: <ExclamationCircleOutlined />,
    in_progress: <SyncOutlined spin />,
    resolved: <CheckCircleOutlined />,
    closed: <ClockCircleOutlined />
  };
  return icons[status] || null;
};

const SupportTicketMobileCard = ({ record, onUpdateStatus, onAddNote }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card 
      size="small" 
      className="mb-3 border-gray-100 shadow-sm"
      actions={[
        record.status === 'open' && (
          <Button key="start" type="link" size="small" onClick={() => onUpdateStatus(record.id, 'in_progress')}>Start</Button>
        ),
        ['open', 'in_progress'].includes(record.status) && (
          <Button key="resolve" type="link" size="small" className="text-green-600" onClick={() => onUpdateStatus(record.id, 'resolved')}>Resolve</Button>
        ),
        record.status === 'resolved' && (
          <Button key="close" type="link" size="small" onClick={() => onUpdateStatus(record.id, 'closed')}>Close</Button>
        ),
        <Button key="note" type="link" size="small" icon={<MessageOutlined />} onClick={() => onAddNote(record)}>Note</Button>
      ].filter(Boolean)}
    >
      <div className="flex justify-between items-start mb-2">
         <Space direction="vertical" size={0}>
            <Text strong className="text-lg">{record.student_name}</Text>
            <Text type="secondary" className="text-xs">{record.student_email}</Text>
         </Space>
         <div className="flex flex-col items-end gap-1">
            <Tag color={getPriorityColor(record.priority)}>{record.priority?.toUpperCase()}</Tag>
            <Tag icon={getStatusIcon(record.status)} color={getStatusColor(record.status)}>
              {record.status?.replace('_', ' ').toUpperCase()}
            </Tag>
         </div>
      </div>
      
      <div className="mb-2">
        <Text strong>{record.subject}</Text>
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
         <Tag>{record.channel}</Tag>
         <span>{new Date(record.created_at).toLocaleString()}</span>
      </div>

       <Button 
        type="text" 
        size="small" 
        block 
        onClick={() => setExpanded(!expanded)}
        className="text-gray-500 bg-gray-50 text-xs"
        icon={<DownOutlined rotate={expanded ? 180 : 0}/>}
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </Button>

      {expanded && (
        <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
          <div className="mb-2">
            <strong>Message:</strong>
            <div className="mt-1 p-2 bg-white rounded border border-gray-100">
               {record.message}
            </div>
          </div>
          {record.metadata?.notes && record.metadata.notes.length > 0 && (
            <div>
              <strong>Internal Notes:</strong>
              {record.metadata.notes.map((n, i) => (
                <div key={i} className="mt-1 p-2 bg-yellow-50 rounded border border-yellow-100 text-xs">
                   <div className="text-gray-400 mb-1">{new Date(n.timestamp).toLocaleString()}</div>
                   <div>{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};


/**
 * SupportTicketsPage - Admin/Manager support ticket management
 * View all student support requests with filtering and status management
 */
const SupportTicketsPage = () => {
  const [tickets, setTickets] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [filters, setFilters] = useState({
    status: null,
    priority: null
  });

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;

      const response = await axios.get('/api/admin/support-tickets', { params });
      setTickets(response.data.data);
    } catch {
      message.error('Failed to load support tickets');
      // Error already handled
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchStatistics = async () => {
    try {
      const response = await axios.get('/api/admin/support-tickets/statistics');
      setStatistics(response.data.data);
    } catch {
      // Statistics are optional, fail silently
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchStatistics();
  }, [fetchTickets]);

  const updateTicketStatus = async (ticketId, newStatus) => {
    try {
      await axios.patch(`/api/admin/support-tickets/${ticketId}/status`, {
        status: newStatus
      });
      message.success(`Ticket marked as ${newStatus}`);
      fetchTickets();
      fetchStatistics();
    } catch {
      message.error('Failed to update ticket status');
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) {
      message.warning('Please enter a note');
      return;
    }

    try {
      await axios.post(`/api/admin/support-tickets/${selectedTicket.id}/notes`, {
        note: noteText
      });
      message.success('Note added successfully');
      setIsNoteModalOpen(false);
      setNoteText('');
      fetchTickets();
    } catch {
      message.error('Failed to add note');
    }
  };

  const columns = [
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority) => (
        <Tag color={getPriorityColor(priority)}>
          {priority?.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <Tag icon={getStatusIcon(status)} color={getStatusColor(status)}>
          {status?.replace('_', ' ').toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Student',
      key: 'student',
      width: 200,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.student_name}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{record.student_email}</div>
        </div>
      )
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 100,
      render: (channel) => <Tag>{channel}</Tag>
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space size="small" wrap>
          {record.status === 'open' && (
            <Button
              type="primary"
              size="small"
              onClick={() => updateTicketStatus(record.id, 'in_progress')}
            >
              Start
            </Button>
          )}
          {['open', 'in_progress'].includes(record.status) && (
            <Button
              type="primary"
              size="small"
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => updateTicketStatus(record.id, 'resolved')}
            >
              Resolve
            </Button>
          )}
          {record.status === 'resolved' && (
            <Button
              size="small"
              onClick={() => updateTicketStatus(record.id, 'closed')}
            >
              Close
            </Button>
          )}
          <Button
            size="small"
            icon={<MessageOutlined />}
            onClick={() => {
              setSelectedTicket(record);
              setIsNoteModalOpen(true);
            }}
          >
            Note
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Support Tickets</Title>

      {/* Statistics Dashboard */}
      {statistics && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Tickets"
                value={statistics.total}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Open"
                value={statistics.byStatus.open || 0}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="In Progress"
                value={statistics.byStatus.in_progress || 0}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Resolved"
                value={statistics.byStatus.resolved || 0}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <div>
            <span style={{ marginRight: 8 }}>Status:</span>
            <Select
              allowClear
              placeholder="All statuses"
              style={{ width: 150 }}
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'closed', label: 'Closed' }
              ]}
            />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>Priority:</span>
            <Select
              allowClear
              placeholder="All priorities"
              style={{ width: 150 }}
              value={filters.priority}
              onChange={(value) => setFilters({ ...filters, priority: value })}
              options={[
                { value: 'urgent', label: 'Urgent' },
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' }
              ]}
            />
          </div>
          <Button onClick={fetchTickets} icon={<SyncOutlined />}>
            Refresh
          </Button>
        </Space>
      </Card>

      {/* Tickets Table */}
      <Card>
        <UnifiedResponsiveTable
          dataSource={tickets}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} tickets`
          }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '12px 0' }}>
                <div style={{ marginBottom: 12 }}>
                  <strong>Message:</strong>
                  <div style={{ marginTop: 8, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    {record.message}
                  </div>
                </div>
                {record.metadata?.notes && record.metadata.notes.length > 0 && (
                  <div>
                    <strong>Internal Notes:</strong>
                    {record.metadata.notes.map((note) => (
                      <div
                        key={`${note.timestamp}-${note.note.slice(0, 20)}`}
                        style={{
                          marginTop: 8,
                          padding: 12,
                          backgroundColor: '#fffbe6',
                          borderRadius: 4,
                          borderLeft: '3px solid #faad14'
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          {new Date(note.timestamp).toLocaleString()}
                        </div>
                        <div>{note.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }}
          mobileCardRenderer={(props) => (
            <SupportTicketMobileCard 
              {...props} 
              onUpdateStatus={updateTicketStatus}
              onAddNote={(record) => {
                  setSelectedTicket(record);
                  setIsNoteModalOpen(true);
              }}
            />
          )}
        />
      </Card>

      {/* Add Note Modal */}
      <Modal
        title="Add Internal Note"
        open={isNoteModalOpen}
        onCancel={() => {
          setIsNoteModalOpen(false);
          setNoteText('');
        }}
        onOk={addNote}
        okText="Add Note"
      >
        {selectedTicket && (
          <div style={{ marginBottom: 16 }}>
            <div><strong>Student:</strong> {selectedTicket.student_name}</div>
            <div><strong>Subject:</strong> {selectedTicket.subject}</div>
          </div>
        )}
        <TextArea
          rows={4}
          placeholder="Enter internal note (not visible to student)..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default SupportTicketsPage;
