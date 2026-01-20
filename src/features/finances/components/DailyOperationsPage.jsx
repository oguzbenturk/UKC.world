import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, DatePicker, Radio, Table, Tag, Space, Statistic, Row, Col, Divider, Alert, Spin } from 'antd';
import moment from 'moment';
import { getDailyOperations } from '../services/dailyOperationsService.js';

function currency(amount) {
  return (amount ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'EUR' });
}

function SummarySection({ data, anomalySummary }) {
  return (
    <>
      <Row gutter={16}>
        <Col xs={12} md={6}><Statistic title="Payments" value={data.totals.payments.count} /></Col>
  <Col xs={12} md={6}><Statistic title="Payments Income" value={data.totals.payments.gross} precision={2} /></Col>
        <Col xs={12} md={6}><Statistic title="Created Rentals" value={data.totals.rentals.created_count} /></Col>
        <Col xs={12} md={6}><Statistic title="Active Rentals" value={data.totals.rentals.active_count} /></Col>
      </Row>
      <Divider className="my-4" />
      <Row gutter={16}>
        <Col xs={24} md={8}><Card size="small" title="Rental Revenue (Created)">{currency(data.totals.rentals.expected_rental_revenue_created)}</Card></Col>
        <Col xs={24} md={8}><Card size="small" title="Rental Revenue (Active)">{currency(data.totals.rentals.expected_rental_revenue_active)}</Card></Col>
        <Col xs={24} md={8}><Card size="small" title="Rental Revenue Received">{currency(data.totals.rentals.rental_revenue_received)}</Card></Col>
      </Row>
    </>
  );
}

export default function DailyOperationsPage() {
  const [date, setDate] = useState(moment());
  const [rentalsScope, setRentalsScope] = useState('both');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    getDailyOperations({ date: date.format('YYYY-MM-DD'), rentalsScope })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(()=> setLoading(false));
  }, [date, rentalsScope]);

  useEffect(() => { load(); }, [load]);

  const paymentsColumns = [
    { title: 'Time', dataIndex: 'transaction_date', render: v => moment(v).format('HH:mm') },
    { title: 'Amount', dataIndex: 'amount', render: v => <span className={v<0?'text-red-600':'text-green-600'}>{currency(v)}</span> },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Method', dataIndex: 'payment_method' },
    { title: 'Rental', dataIndex: 'rental_id', render: id => id ? <Tag color="blue">{id.slice(0,8)}</Tag> : <Tag>—</Tag> },
    { title: 'Ref', dataIndex: 'reference_number', render: r => r || '—' },
    { title: 'Description', dataIndex: 'description', ellipsis: true }
  ];

  const rentalColumns = [
    { title: 'Start', dataIndex: 'start_date', render: v => moment(v).format('HH:mm') },
    { title: 'End', dataIndex: 'end_date', render: v => moment(v).format('HH:mm') },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={s==='closed'?'green':s==='active'?'blue':'default'}>{s}</Tag> },
    { title: 'Payment', dataIndex: 'payment_status', render: s => <Tag color={['paid','closed'].includes(s)?'green':'orange'}>{s}</Tag> },
    { title: 'Price', dataIndex: 'total_price', render: v => currency(v) },
    { title: 'Paid Today', dataIndex: 'amount_paid_today', render: v => currency(v || 0) },
    { title: 'Created', dataIndex: 'created_at', render: v => moment(v).format('HH:mm') },
    { title: 'Flags', dataIndex: 'id', render: (_, r) => {
        const flags = [];
        if (r.anomalies?.includes('unmatched')) flags.push(<Tag color="red" key="unmatched">Unmatched</Tag>);
        if (r.anomalies?.includes('overdue')) flags.push(<Tag color="orange" key="overdue">Overdue</Tag>);
        if (r.anomalies?.includes('large_unpaid')) flags.push(<Tag color="magenta" key="large">Large Unpaid</Tag>);
        return <Space size={2}>{flags}</Space>;
      }
    }
  ];

  const anomalySummary = useMemo(() => data?.anomalies || {}, [data]);

  const enrichRentals = (list) => {
    if (!data) return [];
    const { anomalies } = data;
    const setUnmatched = new Set(anomalies.unmatchedPaidRentals || []);
    const setOverdue = new Set(anomalies.overdueActiveRentals || []);
    const setLarge = new Set(anomalies.largeActiveUnpaidRentals || []);
    return list.map(r => ({
      ...r,
      anomalies: [
        setUnmatched.has(r.id) ? 'unmatched' : null,
        setOverdue.has(r.id) ? 'overdue' : null,
        setLarge.has(r.id) ? 'large_unpaid' : null
      ].filter(Boolean)
    }));
  };

  return (
    <div className="space-y-4">
      <Card size="small" title="Daily Operations – Rentals & Finance" extra={<Space>
        <DatePicker value={date} onChange={d => d && setDate(d)} allowClear={false} size="small" />
        <Radio.Group size="small" value={rentalsScope} onChange={e => setRentalsScope(e.target.value)}>
          <Radio.Button value="created">Created</Radio.Button>
          <Radio.Button value="active">Active</Radio.Button>
          <Radio.Button value="both">Both</Radio.Button>
        </Radio.Group>
      </Space>}>
        {error && <Alert type="error" message={error} className="mb-2" />}
        {loading && <div className="py-6 text-center"><Spin /></div>}
        {!loading && data && (
          <>
            <SummarySection data={data} anomalySummary={anomalySummary} />
            <Divider orientation="left">Payments</Divider>
            <Table size="small" rowKey="id" dataSource={data.payments} columns={paymentsColumns} pagination={{ pageSize: 10 }} />
            <Divider orientation="left">Rentals (Created)</Divider>
            <Table size="small" rowKey="id" dataSource={enrichRentals(data.rentalsCreated)} columns={rentalColumns} pagination={{ pageSize: 10 }} />
            <Divider orientation="left">Rentals (Active)</Divider>
            <Table size="small" rowKey="id" dataSource={enrichRentals(data.rentalsActive)} columns={rentalColumns} pagination={{ pageSize: 10 }} />
          </>
        )}
      </Card>
    </div>
  );
}
