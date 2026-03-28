import React, { useState } from 'react';
import { Table, Tag, Button, Modal, Spin, message, Typography, Popconfirm, Image, Badge } from 'antd';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, BankOutlined, LoadingOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;

export default function PendingLessonsTab() {
  const queryClient = useQueryClient();
  const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);

  // Fetch pending transfers
  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['pending-transfers'],
    queryFn: async () => {
      const response = await apiClient.get('/bookings/pending-transfers?status=pending');
      return response.data?.results || [];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Action mutation (Approve/Reject)
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
        return (
          <div>
            <Tag color={isPackage ? 'blue' : 'purple'} className="mb-1">
              {isPackage ? 'Package' : 'Individual Lesson'}
            </Tag>
            <div className="font-medium text-slate-700 max-w-[200px] truncate" title={isPackage ? record.package_name : 'Lesson Session'}>
              {isPackage ? record.package_name : `Lesson on ${record.booking_date}`}
            </div>
            {!isPackage && record.start_hour && (
             <div className="text-xs text-slate-500">
               Time: {record.start_hour}:00 for {record.duration}h
             </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Bank & Amount',
      key: 'bank_amount',
      render: (_, record) => (
        <div>
          <div className="whitespace-nowrap font-bold text-slate-800">
            {formatCurrency(record.amount || 0, record.currency || 'EUR')}
          </div>
          <div className="text-xs text-slate-500 truncate max-w-[150px]" title={record.bank_name}>
            <BankOutlined className="mr-1" />
            {record.bank_name || 'N/A'}
          </div>
        </div>
      ),
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
            description="This will confirm the lesson/package."
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
            description="This will cancel the pending lesson/package."
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

      {/* Receipt View Modal */}
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
