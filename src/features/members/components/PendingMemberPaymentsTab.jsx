import { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Modal, message, Popconfirm, Image, Spin } from 'antd';
import {
  EyeOutlined, CheckCircleOutlined, CloseCircleOutlined,
  BankOutlined, LoadingOutlined, CrownOutlined, HomeOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { formatCurrency } from '@/shared/utils/formatters';
import realTimeService from '@/shared/services/realTimeService';
import PendingDepositsTab from '@/features/finances/components/PendingDepositsTab';

export default function PendingMemberPaymentsTab() {
  const queryClient = useQueryClient();
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pending-membership-payments'] });
    queryClient.invalidateQueries({ queryKey: ['pending-membership-payments-count'] });
  }, [queryClient]);

  useEffect(() => {
    realTimeService.on('pending-membership-payment:new', invalidate);
    realTimeService.on('pending-membership-payment:updated', invalidate);
    return () => {
      realTimeService.off('pending-membership-payment:new', invalidate);
      realTimeService.off('pending-membership-payment:updated', invalidate);
    };
  }, [invalidate]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['pending-membership-payments'],
    queryFn: async () => {
      const res = await apiClient.get('/member-offerings/admin/pending-payments?status=pending');
      return res.data?.results || [];
    },
    refetchInterval: 60000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reviewerNotes }) => {
      const res = await apiClient.patch(`/member-offerings/admin/pending-payments/${id}/action`, {
        action,
        reviewerNotes,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      message.success(`Payment ${variables.action}d successfully`);
      invalidate();
    },
    onError: (err) => {
      message.error(err?.response?.data?.error || 'Action failed');
    },
  });

  const handleAction = (id, action) => {
    actionMutation.mutate({ id, action, reviewerNotes: '' });
  };

  const columns = [
    {
      title: 'Date Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      width: 140,
    },
    {
      title: 'Member',
      key: 'member',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-slate-800">
            {record.first_name} {record.last_name}
          </div>
          <div className="text-xs text-slate-500">{record.email}</div>
        </div>
      ),
      width: 180,
    },
    {
      title: 'Membership Details',
      key: 'details',
      render: (_, record) => (
        <div>
          <div className="font-medium text-slate-800 flex items-center gap-1.5">
            <CrownOutlined className="text-amber-500" />
            {record.offering_name || 'Membership'}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {record.period && (
              <Tag color="blue" className="text-xs m-0">{record.period}</Tag>
            )}
            {record.duration_days && (
              <Tag color="cyan" className="text-xs m-0">{record.duration_days} days</Tag>
            )}
          </div>
          {record.offering_price && (
            <div className="text-xs text-slate-500 mt-1">
              Full price: {formatCurrency(record.offering_price, 'EUR')}
            </div>
          )}
        </div>
      ),
      width: 220,
    },
    {
      title: 'Bank & Amount',
      key: 'bank_amount',
      render: (_, record) => {
        const isDeposit = record.admin_notes?.startsWith('DEPOSIT');
        return (
          <div>
            <div className="font-bold text-slate-800">
              {formatCurrency(record.amount, record.currency || 'EUR')}
            </div>
            {isDeposit && (
              <Tag color="purple" className="text-xs mt-1 m-0">
                Deposit — rest on arrival
              </Tag>
            )}
            {record.bank_name && (
              <div className="text-xs text-slate-500 mt-1">
                <BankOutlined className="mr-1" />
                {record.bank_name}
              </div>
            )}
          </div>
        );
      },
      width: 160,
    },
    {
      title: 'Receipt',
      key: 'receipt',
      render: (_, record) => (
        record.receipt_url ? (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReceiptUrl(record.receipt_url);
              setReceiptModalVisible(true);
            }}
          >
            View
          </Button>
        ) : (
          <span className="text-xs text-slate-400">No receipt</span>
        )
      ),
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="flex gap-2">
          <Popconfirm
            title="Approve this payment?"
            description="The membership will be activated immediately."
            onConfirm={() => handleAction(record.id, 'approve')}
            okText="Approve"
            okButtonProps={{ style: { background: '#10b981' } }}
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ background: '#10b981', borderColor: '#10b981' }}
              loading={actionMutation.isPending && actionMutation.variables?.id === record.id && actionMutation.variables?.action === 'approve'}
            >
              Approve
            </Button>
          </Popconfirm>
          <Popconfirm
            title="Reject this payment?"
            description="The membership will be cancelled."
            onConfirm={() => handleAction(record.id, 'reject')}
            okText="Reject"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              loading={actionMutation.isPending && actionMutation.variables?.id === record.id && actionMutation.variables?.action === 'reject'}
            >
              Reject
            </Button>
          </Popconfirm>
        </div>
      ),
      width: 200,
    },
  ];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">
          Pending Membership Payments
        </h3>
        {isFetching && !isLoading && (
          <Spin indicator={<LoadingOutlined spin />} size="small" />
        )}
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        pagination={data.length > 10 ? { pageSize: 10 } : false}
        locale={{ emptyText: 'No pending membership payments' }}
        scroll={{ x: 1000 }}
      />

      <Modal
        open={receiptModalVisible}
        title="Transfer Receipt"
        footer={null}
        onCancel={() => setReceiptModalVisible(false)}
        width={600}
      >
        {selectedReceiptUrl && (
          selectedReceiptUrl.toLowerCase().endsWith('.pdf')
            ? (
              <div className="text-center">
                <a href={selectedReceiptUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="primary">Open PDF Receipt</Button>
                </a>
              </div>
            )
            : <Image src={selectedReceiptUrl} alt="Receipt" style={{ width: '100%' }} />
        )}
      </Modal>

      <div className="border-t border-slate-200 mt-6">
        <PendingAccommodationDepositsSection
          receiptModalVisible={receiptModalVisible}
          setReceiptModalVisible={setReceiptModalVisible}
          setSelectedReceiptUrl={setSelectedReceiptUrl}
        />
      </div>

      <div className="border-t border-slate-200 mt-6">
        <PendingDepositsTab />
      </div>
    </div>
  );
}

function PendingAccommodationDepositsSection({ setReceiptModalVisible, setSelectedReceiptUrl }) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pending-accommodation-deposits'] });
    queryClient.invalidateQueries({ queryKey: ['pending-payments-combined-count'] });
  }, [queryClient]);

  useEffect(() => {
    realTimeService.on('pending-accommodation-deposit:new', invalidate);
    realTimeService.on('pending-accommodation-deposit:updated', invalidate);
    return () => {
      realTimeService.off('pending-accommodation-deposit:new', invalidate);
      realTimeService.off('pending-accommodation-deposit:updated', invalidate);
    };
  }, [invalidate]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['pending-accommodation-deposits'],
    queryFn: async () => {
      const res = await apiClient.get('/accommodation/admin/pending-deposits?status=pending');
      return res.data?.results || [];
    },
    refetchInterval: 60000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reviewerNotes }) => {
      const res = await apiClient.patch(`/accommodation/admin/pending-deposits/${id}/action`, { action, reviewerNotes });
      return res.data;
    },
    onSuccess: (_, variables) => {
      message.success(`Deposit ${variables.action}d successfully`);
      invalidate();
    },
    onError: (err) => {
      message.error(err?.response?.data?.error || 'Action failed');
    },
  });

  const columns = [
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      width: 130,
    },
    {
      title: 'Guest',
      key: 'guest',
      render: (_, r) => (
        <div>
          <div className="font-semibold text-slate-800">{r.first_name} {r.last_name}</div>
          <div className="text-xs text-slate-500">{r.email}</div>
        </div>
      ),
      width: 180,
    },
    {
      title: 'Booking Details',
      key: 'booking',
      render: (_, r) => (
        <div>
          <div className="font-medium text-slate-800 flex items-center gap-1.5">
            <HomeOutlined className="text-blue-500" />
            {r.unit_name}
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
            <CalendarOutlined />
            {r.check_in_date?.slice(0, 10)} → {r.check_out_date?.slice(0, 10)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Full price: {formatCurrency(r.total_price, 'EUR')}
          </div>
        </div>
      ),
      width: 220,
    },
    {
      title: 'Deposit & Bank',
      key: 'deposit',
      render: (_, r) => {
        const isDeposit = r.admin_notes?.startsWith('DEPOSIT');
        return (
          <div>
            <div className="font-bold text-slate-800">{formatCurrency(r.amount, r.currency || 'EUR')}</div>
            {isDeposit && <Tag color="purple" className="text-xs mt-1 m-0">Deposit — rest on arrival</Tag>}
            {r.bank_name && (
              <div className="text-xs text-slate-500 mt-1">
                <BankOutlined className="mr-1" />{r.bank_name}
              </div>
            )}
          </div>
        );
      },
      width: 160,
    },
    {
      title: 'Receipt',
      key: 'receipt',
      render: (_, r) => r.receipt_url ? (
        <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedReceiptUrl(r.receipt_url); setReceiptModalVisible(true); }}>View</Button>
      ) : <span className="text-xs text-slate-400">No receipt</span>,
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) => (
        <div className="flex gap-2">
          <Popconfirm
            title="Approve this deposit?"
            description="The booking will be confirmed and the guest notified."
            onConfirm={() => actionMutation.mutate({ id: r.id, action: 'approve', reviewerNotes: '' })}
            okText="Approve"
            okButtonProps={{ style: { background: '#10b981' } }}
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ background: '#10b981', borderColor: '#10b981' }}
              loading={actionMutation.isPending && actionMutation.variables?.id === r.id && actionMutation.variables?.action === 'approve'}
            >
              Approve
            </Button>
          </Popconfirm>
          <Popconfirm
            title="Reject this deposit?"
            description="The booking will be cancelled and the guest notified."
            onConfirm={() => actionMutation.mutate({ id: r.id, action: 'reject', reviewerNotes: '' })}
            okText="Reject"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              loading={actionMutation.isPending && actionMutation.variables?.id === r.id && actionMutation.variables?.action === 'reject'}
            >
              Reject
            </Button>
          </Popconfirm>
        </div>
      ),
      width: 200,
    },
  ];

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <HomeOutlined className="text-blue-500" />
          Pending Accommodation Deposits
        </h3>
        {isFetching && !isLoading && <Spin indicator={<LoadingOutlined spin />} size="small" />}
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        pagination={data.length > 10 ? { pageSize: 10 } : false}
        locale={{ emptyText: 'No pending accommodation deposits' }}
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
