// src/features/manager/components/CommissionHistoryTable.jsx
import { Card, Table, Tag, Select, DatePicker, Empty, Tooltip } from 'antd';
import { 
  CalendarOutlined, 
  CarOutlined, 
  ClockCircleOutlined, 
  CheckCircleOutlined,
  FilterOutlined 
} from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const getColumns = () => [
  {
    title: 'Date',
    dataIndex: 'booking_date',
    key: 'date',
    render: (date) => dayjs(date).format('DD MMM YYYY')
  },
  {
    title: 'Source',
    dataIndex: 'source_type',
    key: 'source',
    render: (type) => (
      <Tag 
        color={type === 'booking' ? 'blue' : 'green'}
        icon={type === 'booking' ? <CalendarOutlined /> : <CarOutlined />}
      >
        {type === 'booking' ? 'Lesson' : 'Rental'}
      </Tag>
    )
  },
  {
    title: 'Original Amount',
    key: 'sourceAmount',
    render: (_, record) => (
      <span className="text-gray-600">
        {formatCurrency(record.source_amount, record.source_currency)}
      </span>
    )
  },
  {
    title: 'Rate',
    dataIndex: 'commission_rate',
    key: 'rate',
    render: (rate) => <Tag color="purple">{rate}%</Tag>
  },
  {
    title: 'Commission',
    key: 'commission',
    render: (_, record) => (
      <span className="font-semibold text-green-600">
        {formatCurrency(record.commission_amount, record.commission_currency)}
      </span>
    )
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (status) => {
      const config = {
        pending: { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending' },
        paid: { color: 'green', icon: <CheckCircleOutlined />, label: 'Paid' },
        cancelled: { color: 'red', icon: null, label: 'Cancelled' }
      };
      const { color, icon, label } = config[status] || config.pending;
      return <Tag color={color} icon={icon}>{label}</Tag>;
    }
  },
  {
    title: 'Details',
    key: 'details',
    render: (_, record) => {
      const details = record.source_details || record.metadata;
      if (!details) return <span className="text-gray-400">—</span>;
      
      return (
        <Tooltip title={
          <div>
            {details.student_name && <div>Student: {details.student_name}</div>}
            {details.instructor_name && <div>Instructor: {details.instructor_name}</div>}
            {details.service_name && <div>Service: {details.service_name}</div>}
            {details.customer_name && <div>Customer: {details.customer_name}</div>}
            {details.equipment_name && <div>Equipment: {details.equipment_name}</div>}
          </div>
        }>
          <span className="text-blue-500 cursor-pointer">View</span>
        </Tooltip>
      );
    }
  }
];

function CommissionHistoryTable({ 
  commissions, 
  loading, 
  pagination, 
  filters, 
  onFiltersChange, 
  onTableChange 
}) {
  const columns = getColumns();

  return (
    <Card 
      title={
        <span className="flex items-center gap-2">
          <CalendarOutlined />
          Commission History
        </span>
      }
      className="shadow-sm"
      extra={
        <div className="flex items-center gap-2">
          <FilterOutlined className="text-gray-400" />
          <Select
            placeholder="Source"
            allowClear
            style={{ width: 120 }}
            value={filters.sourceType}
            onChange={(value) => onFiltersChange({ ...filters, sourceType: value })}
          >
            <Option value="booking">Lessons</Option>
            <Option value="rental">Rentals</Option>
          </Select>
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 120 }}
            value={filters.status}
            onChange={(value) => onFiltersChange({ ...filters, status: value })}
          >
            <Option value="pending">Pending</Option>
            <Option value="paid">Paid</Option>
            <Option value="cancelled">Cancelled</Option>
          </Select>
          <RangePicker
            value={filters.dateRange}
            onChange={(dates) => onFiltersChange({ ...filters, dateRange: dates })}
            style={{ width: 240 }}
          />
        </div>
      }
    >
      {commissions.length === 0 && !loading ? (
        <Empty description="No commission records found" />
      ) : (
        <Table
          columns={columns}
          dataSource={commissions}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.page,
            total: pagination.total,
            pageSize: pagination.limit,
            showSizeChanger: false,
            showTotal: (total) => `Total ${total} records`
          }}
          onChange={onTableChange}
        />
      )}
    </Card>
  );
}

export default CommissionHistoryTable;
