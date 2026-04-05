import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Modal, Spin, message, Typography, Popconfirm, Image, Badge, Collapse } from 'antd';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, BankOutlined, LoadingOutlined, CalendarOutlined, ClockCircleOutlined, UserOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { formatCurrency } from '@/shared/utils/formatters';
import realTimeService from '@/shared/services/realTimeService';

export default function PendingLessonsTab() {
  const queryClient = useQueryClient();
  const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const invalidatePendingTransfers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['pending-transfers-count'] });
  }, [queryClient]);

  useEffect(() => {
    realTimeService.on('pending-transfer:new', invalidatePendingTransfers);
    realTimeService.on('pending-transfer:updated', invalidatePendingTransfers);
    realTimeService.on('booking:created', invalidatePendingTransfers);
    return () => {
      realTimeService.off('pending-transfer:new', invalidatePendingTransfers);
      realTimeService.off('pending-transfer:updated', invalidatePendingTransfers);
      realTimeService.off('booking:created', invalidatePendingTransfers);
    };
  }, [invalidatePendingTransfers]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['pending-transfers'],
    queryFn: async () => {
      const response = await apiClient.get('/bookings/pending-transfers?status=pending');
      return response.data?.results || [];
    },
    refetchInterval: 60000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, reviewerNotes }) => {
      const response = await apiClient.patch(`/bookings/pending-transfers/${id}/action`, {
        action,
        reviewerNotes,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      message.success(`Transfer ${variables.action}d successfully`);
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transfers-count'] });
    },
    onError: (err) => {
      message.error(err?.response?.data?.error || 'Action failed');
    },
  });

  const handleAction = (id, action) => {
    actionMutation.mutate({ id, action, reviewerNotes: '' });
  };

  const toggleExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (startHour) => {
    if (startHour == null) return '';
    const h = Math.floor(Number(startHour));
    const m = Math.round((Number(startHour) % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const columns = [
    {
      title: 'Date Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      width: 140,
    },
    {
      title: 'Student',
      key: 'student',
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
      title: 'Purchase Details',
      key: 'details',
      render: (_, record) => {
        const isPackage = !!record.customer_package_id;
        const bookings = record.package_bookings || [];
        const isExpanded = expandedRows[record.id];
        return (
          <div>
            <div className="flex items-center gap-2">
              <Tag color={isPackage ? 'blue' : 'purple'} className="mb-0">
                {isPackage ? 'Package' : 'Individual Lesson'}
              </Tag>
              {isPackage && bookings.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(record.id); }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full transition-colors cursor-pointer border-0"
                >
                  {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                  {bookings.length} lesson{bookings.length !== 1 ? 's' : ''} booked
                </button>
              )}
            </div>
            <div className="font-medium text-slate-700 mt-1 max-w-[260px] truncate" title={isPackage ? record.package_name : 'Lesson Session'}>
              {isPackage ? record.package_name : `Lesson on ${formatDate(record.booking_date)}`}
            </div>
            {isPackage && record.total_hours && (
              <div className="text-xs text-slate-400 mt-0.5">
                {parseFloat(record.used_hours || 0)}h used / {parseFloat(record.total_hours)}h total
              </div>
            )}
            {!isPackage && record.start_hour != null && (
              <div className="text-xs text-slate-500">
                Time: {formatTime(record.start_hour)} for {record.duration}h
              </div>
            )}

            {isPackage && isExpanded && bookings.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2 space-y-1.5">
                {bookings.map((bk) => (
                  <div key={bk.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-md px-2.5 py-1.5">
                    <CalendarOutlined className="text-slate-400" />
                    <span className="font-medium text-slate-700">{formatDate(bk.date)}</span>
                    <ClockCircleOutlined className="text-slate-400 ml-1" />
                    <span className="text-slate-600">{formatTime(bk.start_hour)} ({bk.duration}h)</span>
                    {bk.instructor_name && (
                      <>
                        <UserOutlined className="text-slate-400 ml-1" />
                        <span className="text-slate-600 truncate max-w-[100px]" title={bk.instructor_name}>{bk.instructor_name}</span>
                      </>
                    )}
                    {bk.service_name && (
                      <span className="text-slate-400 truncate max-w-[100px] ml-auto" title={bk.service_name}>{bk.service_name}</span>
                    )}
                    <Tag
                      color={bk.status === 'pending_payment' ? 'orange' : bk.status === 'confirmed' ? 'green' : 'default'}
                      className="ml-auto text-[10px] leading-tight px-1.5 py-0"
                    >
                      {bk.status === 'pending_payment' ? 'Awaiting Payment' : bk.status}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Bank & Amount',
      key: 'bank_amount',
      render: (_, record) => {
        const isDeposit = record.admin_notes?.startsWith('DEPOSIT');
        return (
          <div>
            <div className="whitespace-nowrap font-bold text-slate-800">
              {formatCurrency(record.amount || 0, record.currency || 'EUR')}
            </div>
            {isDeposit && (
              <Tag color="purple" className="!text-[10px] !leading-tight !px-1.5 !py-0 !m-0 !mt-0.5">
                Deposit — rest on arrival
              </Tag>
            )}
            <div className="text-xs text-slate-500 truncate max-w-[150px]" title={record.bank_name}>
              <BankOutlined className="mr-1" />
              {record.bank_name || 'N/A'}
            </div>
          </div>
        );
      },
      width: 160,
    },
    {
      title: 'Receipt',
      key: 'receipt',
      align: 'center',
      render: (_, record) => (
        <Button
          type="dashed"
          icon={<EyeOutlined />}
          size="small"
          onClick={() => {
            setSelectedReceiptUrl(record.receipt_url);
            setIsReceiptModalVisible(true);
          }}
        >
          View
        </Button>
      ),
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <div className="flex justify-end gap-2">
          <Popconfirm
            title="Approve this receipt?"
            description="This will confirm the lesson/package and all booked lessons."
            onConfirm={() => handleAction(record.id, 'approve')}
            okText="Yes, Approve"
            cancelText="Cancel"
            okButtonProps={{ loading: actionMutation.isPending }}
          >
            <Button
              type="primary"
              className="bg-green-500 hover:bg-green-600"
              icon={<CheckCircleOutlined />}
              size="small"
              disabled={actionMutation.isPending}
            >
              Approve
            </Button>
          </Popconfirm>
          <Popconfirm
            title="Reject this receipt?"
            description="This will cancel the pending lesson/package and all booked lessons."
            onConfirm={() => handleAction(record.id, 'reject')}
            okText="Yes, Reject"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading: actionMutation.isPending }}
          >
            <Button
              danger
              icon={<CloseCircleOutlined />}
              size="small"
              disabled={actionMutation.isPending}
            >
              Reject
            </Button>
          </Popconfirm>
        </div>
      ),
      width: 220,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 m-0">Pending Bank Transfers</h2>
          <p className="text-sm text-slate-500 m-0 mt-1">
            Review and approve student dekont uploads to confirm their bookings.
          </p>
        </div>
        <div>
          <Badge count={data.length} color="orange" overflowCount={99} />
        </div>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={{
          indicator: <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />,
          spinning: isLoading || isFetching,
        }}
        pagination={{ pageSize: 15 }}
        scroll={{ x: 'max-content' }}
        size="middle"
        className="[&_.ant-table-thead>tr>th]:bg-slate-50 [&_.ant-table-thead>tr>th]:mb-1 [&_.ant-table-thead>tr>th]:text-slate-600 [&_.ant-table-thead>tr>th]:font-semibold"
        locale={{
          emptyText: (
            <div className="py-10 text-center text-slate-500">
              <BankOutlined className="text-4xl text-slate-300 mb-3 block" />
              <p>No pending bank transfer receipts right now.</p>
            </div>
          )
        }}
      />

      <Modal
        open={isReceiptModalVisible}
        onCancel={() => setIsReceiptModalVisible(false)}
        footer={null}
        destroyOnClose
        centered
        width={800}
        title="Payment Receipt"
      >
        <div className="text-center mt-4">
          {selectedReceiptUrl ? (
            <Image
              src={selectedReceiptUrl}
              alt="Receipt"
              style={{ maxHeight: '70vh', objectFit: 'contain' }}
              className="rounded-lg shadow-sm border border-slate-200"
            />
          ) : (
            <p className="text-slate-500">No image available.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
