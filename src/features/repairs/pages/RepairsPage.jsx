import { useState, useEffect, useRef } from 'react';
import { Card, Typography, Table, Button, Tag, Modal, Form, Input, Select, Upload, Empty, Spin, Drawer, Space, Divider, Timeline, Descriptions, Image, Avatar, Checkbox, Tabs } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { PlusOutlined, ToolOutlined, CameraOutlined, EditOutlined, EyeOutlined, MessageOutlined, SendOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import SparePartsOrders from '@/features/admin/pages/SparePartsOrders';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const RepairMobileCard = ({ record, onAction, isAdmin }) => (
  <Card size="small" className="mb-2">
    <div className="flex justify-between items-start mb-2">
      <Space>
        {record.photos && parsePhotos(record.photos)[0] ? (
            <Avatar shape="square" src={parsePhotos(record.photos)[0]} />
        ) : (
            <Avatar shape="square" icon={<ToolOutlined />} />
        )}
        <div>
          <div className="font-medium">{record.item_name}</div>
          <div className="text-xs text-gray-500 capitalize">{record.equipment_type} • {record.location}</div>
        </div>
      </Space>
      <Tag color={record.priority === 'urgent' ? 'red' : record.priority === 'high' ? 'orange' : 'blue'}>
        {record.priority}
      </Tag>
    </div>
    <div className="flex justify-between items-center mt-3">
        <Tag color={record.status === 'completed' ? 'green' : record.status === 'pending' ? 'orange' : 'blue'}>
            {record.status?.toUpperCase().replace('_', ' ')}
        </Tag>
        <Space>
            <Button size="small" icon={<MessageOutlined />} onClick={() => onAction('view', record)}>View</Button>
            {isAdmin && <Button size="small" icon={<EditOutlined />} onClick={() => onAction('edit', record)}>Edit</Button>}
        </Space>
    </div>
  </Card>
);

/**
 * Safely parse photos field which may be JSON string, array, or plain string path
 */
const parsePhotos = (photos) => {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  if (typeof photos === 'string') {
    // Check if it looks like JSON (starts with [)
    if (photos.startsWith('[')) {
      try {
        return JSON.parse(photos);
      } catch {
        return [];
      }
    }
    // Plain string path - wrap in array
    return [photos];
  }
  return [];
};

/**
 * RepairChat - Chat component for repair request conversations
 */
const RepairChat = ({ repairId, isAdmin, userId }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const chatEndRef = useRef(null);

  const fetchComments = async () => {
    if (!repairId) return;
    setLoading(true);
    try {
      const response = await apiClient.get(`/repair-requests/${repairId}/comments`);
      setComments(response.data.data);
    } catch (error) {
      // Silently fail - might be a new table not yet migrated
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [repairId]);

  useEffect(() => {
    // Scroll to bottom when comments change
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await apiClient.post(`/repair-requests/${repairId}/comments`, {
        message: newMessage.trim(),
        isInternal: isInternal
      });
      setNewMessage('');
      setIsInternal(false);
      fetchComments();
    } catch (error) {
      message.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getInitials = (firstName, lastName) => {
    return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase() || '?';
  };

  const getAvatarColor = (role) => {
    const colors = {
      admin: '#f56a00',
      manager: '#7265e6',
      instructor: '#00a2ae',
      student: '#87d068',
      outsider: '#108ee9'
    };
    return colors[role] || '#666';
  };

  return (
    <div className="flex flex-col h-[350px]">
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin size="small" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageOutlined className="text-3xl mb-2" />
            <Text className="text-gray-400">No messages yet</Text>
            <Text className="text-xs text-gray-400">Start the conversation!</Text>
          </div>
        ) : (
          <>
            {comments.map((comment) => {
              const isOwnMessage = comment.user_id === userId;
              const isStaff = ['admin', 'manager'].includes(comment.user_role);
              
              return (
                <div
                  key={comment.id}
                  className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar
                    size={32}
                    style={{ backgroundColor: getAvatarColor(comment.user_role), flexShrink: 0 }}
                  >
                    {getInitials(comment.first_name, comment.last_name)}
                  </Avatar>
                  <div className={`max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
                    <div className={`text-xs text-gray-500 mb-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                      <span className="font-medium">{comment.first_name} {comment.last_name}</span>
                      {isStaff && <Tag size="small" className="text-[10px] px-1 py-0">Staff</Tag>}
                      {comment.is_internal && (
                        <Tag icon={<LockOutlined />} color="purple" className="text-[10px] px-1 py-0">Internal</Tag>
                      )}
                    </div>
                    <div
                      className={`inline-block p-3 rounded-2xl ${
                        isOwnMessage
                          ? 'bg-blue-500 text-white rounded-tr-sm'
                          : comment.is_internal
                          ? 'bg-purple-100 border border-purple-300 rounded-tl-sm'
                          : 'bg-white border rounded-tl-sm'
                      }`}
                    >
                      <Text className={isOwnMessage ? 'text-white' : ''}>
                        {comment.message}
                      </Text>
                    </div>
                    <div className={`text-[10px] text-gray-400 mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
                      {dayjs(comment.created_at).format('MMM D, h:mm A')}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Message input area */}
      <div className="mt-3 pt-3 border-t">
        <div className="flex gap-2">
          <TextArea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            autoSize={{ minRows: 1, maxRows: 3 }}
            className="flex-1"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            disabled={!newMessage.trim()}
          />
        </div>
        {isAdmin && (
          <div className="mt-2">
            <Checkbox
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="text-xs"
            >
              <span className="text-xs text-gray-500">
                <LockOutlined className="mr-1" />
                Internal note (only visible to staff)
              </span>
            </Checkbox>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * RepairsPage - Submit and track repair requests
 * Visible to all users - students, instructors, managers, admin
 */
const RepairsPage = () => {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [repairs, setRepairs] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    fetchRepairs();
  }, []);

  const fetchRepairs = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/repair-requests');
      setRepairs(response.data.data);
    } catch (error) {
      message.error('Failed to load repair requests');
    } finally {
      setLoading(false);
    }
  };

  const priorityOptions = [
    { value: 'low', label: 'Low - Not Urgent', color: 'blue' },
    { value: 'medium', label: 'Medium - Within a Week', color: 'orange' },
    { value: 'high', label: 'High - Urgent', color: 'red' },
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending', color: 'orange' },
    { value: 'in_progress', label: 'In Progress', color: 'blue' },
    { value: 'completed', label: 'Completed', color: 'green' },
    { value: 'cancelled', label: 'Cancelled', color: 'default' },
  ];

  const statusColors = {
    pending: 'orange',
    in_progress: 'blue',
    completed: 'green',
    cancelled: 'default',
  };

  const handleViewDetails = (record) => {
    setSelectedRepair(record);
    setDetailDrawerOpen(true);
  };

  const handleEditStatus = (record) => {
    setSelectedRepair(record);
    editForm.setFieldsValue({
      status: record.status,
      notes: record.notes || '',
    });
    setEditModalOpen(true);
  };

  const handleUpdateRepair = async (values) => {
    if (!selectedRepair) return;
    setUpdating(true);
    try {
      await apiClient.patch(`/repair-requests/${selectedRepair.id}`, {
        status: values.status,
        notes: values.notes,
      });
      message.success('Repair request updated successfully');
      setEditModalOpen(false);
      editForm.resetFields();
      fetchRepairs();
    } catch (error) {
      message.error('Failed to update repair request');
    } finally {
      setUpdating(false);
    }
  };

  const handleQuickStatusChange = async (repairId, newStatus) => {
    try {
      await apiClient.patch(`/repair-requests/${repairId}`, { status: newStatus });
      message.success('Status updated');
      fetchRepairs();
    } catch (error) {
      message.error('Failed to update status');
    }
  };

  const columns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      // Equipment type is free text, show as is
    },
    {
      title: 'Item',
      dataIndex: 'item_name',
      key: 'item_name',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Submitted By',
      dataIndex: 'user_name',
      key: 'user_name',
      render: (name, record) => {
        const isGuest = !record.user_id;
        return (
          <Space size={4}>
            <span>{name || '—'}</span>
            {isGuest && <Tag color="teal" className="text-xs">Guest</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const opt = priorityOptions.find(p => p.value === priority);
        return <Tag color={opt?.color}>{opt?.label || priority}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        if (isAdmin) {
          return (
            <Select
              value={status}
              size="small"
              style={{ width: 130 }}
              onChange={(value) => handleQuickStatusChange(record.id, value)}
              options={statusOptions}
            />
          );
        }
        return <Tag color={statusColors[status]}>{status?.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<MessageOutlined />}
            onClick={() => handleViewDetails(record)}
            title="View Details & Chat"
          />
          {isAdmin && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditStatus(record)}
              title="Edit Status & Notes"
            />
          )}
        </Space>
      ),
    },
  ];

  const handleSubmitRepair = async (values) => {
    try {
      const photos = fileList
        .map(f => f.response?.url || f.url)
        .filter(Boolean);

      await apiClient.post('/repair-requests', {
        equipmentType: values.equipmentType,
        itemName: values.itemName,
        description: values.description,
        priority: values.priority,
        location: values.location,
        photos
      });

      message.success('Repair request submitted successfully');
      setIsModalOpen(false);
      form.resetFields();
      setFileList([]);
      fetchRepairs();
    } catch (error) {
      message.error('Failed to submit repair request');
    }
  };

  const uploadProps = {
    name: 'image',
    listType: 'picture-card',
    fileList,
    onChange: ({ fileList: newFileList }) => setFileList(newFileList),
    customRequest: async ({ file, onSuccess, onError, onProgress }) => {
      try {
        const formData = new FormData();
        formData.append('image', file);
        const token = localStorage.getItem('token');
        
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.total) {
            onProgress?.({ percent: Math.round((e.loaded / e.total) * 100) });
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            onSuccess?.(response);
          } else {
            onError?.(new Error('Upload failed'));
          }
        });
        
        xhr.addEventListener('error', () => {
          onError?.(new Error('Upload failed'));
        });
        
        xhr.open('POST', '/api/upload/repair-image');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      } catch (err) {
        onError?.(err);
      }
    },
    beforeUpload: (file) => {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('You can only upload image files!');
      }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('Image must be smaller than 5MB!');
      }
      return isImage && isLt5M;
    },
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Hero Section */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <ToolOutlined /> Care Center
            </div>
            <h1 className="text-3xl font-semibold">Equipment Care</h1>
            <p className="text-sm text-white/75">
              Manage repairs and spare parts orders for equipment maintenance
            </p>
          </div>
        </div>
      </div>

      {/* Tabs for Repairs and Spare Parts */}
      <Tabs
        defaultActiveKey="repairs"
        items={[
          {
            key: 'repairs',
            label: 'Repairs',
            children: (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="rounded-2xl shadow-sm text-center">
                    <div className="text-2xl font-bold text-orange-500">
                      {repairs.filter(r => r.status === 'pending').length}
                    </div>
                    <Text className="text-slate-500">Pending</Text>
                  </Card>
                  <Card className="rounded-2xl shadow-sm text-center">
                    <div className="text-2xl font-bold text-blue-500">
                      {repairs.filter(r => r.status === 'in_progress').length}
                    </div>
                    <Text className="text-slate-500">In Progress</Text>
                  </Card>
                  <Card className="rounded-2xl shadow-sm text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {repairs.filter(r => r.status === 'completed').length}
                    </div>
                    <Text className="text-slate-500">Completed</Text>
                  </Card>
                  <Card className="rounded-2xl shadow-sm text-center">
                    <div className="text-2xl font-bold text-slate-500">{repairs.length}</div>
                    <Text className="text-slate-500">Total Requests</Text>
                  </Card>
                </div>

                {/* New Repair Button */}
                <div className="flex justify-end">
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setIsModalOpen(true)}
                    className="h-11 rounded-2xl"
                  >
                    New Repair Request
                  </Button>
                </div>

                {/* Repairs Table */}
                <Card className="rounded-2xl shadow-sm">
        <Title level={4} className="mb-4">
          {user?.role === 'admin' || user?.role === 'manager' ? 'All Repair Requests' : 'My Repair Requests'}
        </Title>
        <Spin spinning={loading}>
          {repairs.length > 0 ? (
            <UnifiedResponsiveTable
              dataSource={repairs}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              mobileCardRenderer={(props) => (
                 <RepairMobileCard 
                    {...props} 
                    isAdmin={user?.role === 'admin' || user?.role === 'manager'}
                    onAction={(action, record) => {
                       if (action === 'view') handleViewDetails(record);
                       if (action === 'edit') handleEditStatus(record);
                    }} 
                 />
              )}
            />
          ) : (
            <Empty
            image={<ToolOutlined className="text-6xl text-slate-300" />}
            description={
              <div className="space-y-2">
                <Text className="text-slate-500">No Repair Requests</Text>
                <p className="text-xs text-slate-400">
                  Submit a repair request when equipment or facilities need fixing
                </p>
              </div>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Submit First Request
            </Button>
          </Empty>
        )}
        </Spin>
      </Card>
              </div>
            ),
          },
          {
            key: 'spare-parts',
            label: 'Spare Parts',
            children: <SparePartsOrders />,
          },
        ]}
      />

      {/* Create Repair Request Modal */}
      <Modal
        title="New Repair Request"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmitRepair}
          className="mt-4"
        >
          <Form.Item
            name="equipmentType"
            label="Brand and Model"
            rules={[{ required: true, message: 'Please enter brand and model' }]}
          >
            <Input placeholder="e.g., Surfboard, Diving Gear, Bicycle, Yoga Mat..." />
          </Form.Item>

          <Form.Item
            name="itemName"
            label="Item Name / ID"
            rules={[{ required: true, message: 'Please enter item name or ID' }]}
          >
            <Input placeholder="e.g., Surfboard #12, BCD Size L, Yoga Mat Blue" />
          </Form.Item>

          <Form.Item
            name="description"
            label="What's Wrong?"
            rules={[{ required: true, message: 'Please describe the issue' }]}
          >
            <TextArea rows={3} placeholder="Describe the problem in detail..." />
          </Form.Item>

          <Form.Item
            name="photos"
            label="Photos (optional)"
          >
            <Upload {...uploadProps}>
              {fileList.length >= 4 ? null : (
                <div>
                  <CameraOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <Form.Item
            name="priority"
            label="Priority"
            rules={[{ required: true, message: 'Please select priority' }]}
          >
            <Select placeholder="How urgent is this?" options={priorityOptions} />
          </Form.Item>

          <Form.Item
            name="location"
            label="Current Location"
          >
            <Input placeholder="Where is the item now?" />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">Submit Request</Button>
          </div>
        </Form>
      </Modal>

      {/* Repair Detail Drawer */}
      <Drawer
        title="Repair Request Details"
        placement="right"
        width={560}
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen}
        extra={
          isAdmin && selectedRepair && (
            <Button 
              type="primary" 
              icon={<EditOutlined />}
              onClick={() => {
                setDetailDrawerOpen(false);
                handleEditStatus(selectedRepair);
              }}
            >
              Edit
            </Button>
          )
        }
      >
        {selectedRepair && (
          <div className="space-y-6">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Equipment">
                {selectedRepair.equipment_type}
              </Descriptions.Item>
              <Descriptions.Item label="Item">
                {selectedRepair.item_name}
              </Descriptions.Item>
              <Descriptions.Item label="Submitted By">
                <Space size={4}>
                  {selectedRepair.user_name || 'Unknown'}
                  {!selectedRepair.user_id && <Tag color="teal">Guest</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {selectedRepair.user_email || 'N/A'}
              </Descriptions.Item>
              {!selectedRepair.user_id && selectedRepair.guest_phone && (
                <Descriptions.Item label="Phone">
                  {selectedRepair.guest_phone}
                </Descriptions.Item>
              )}
              {!selectedRepair.user_id && selectedRepair.tracking_token && (
                <Descriptions.Item label="Tracking Token">
                  <span className="font-mono text-xs text-teal-600 break-all">{selectedRepair.tracking_token}</span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Location">
                {selectedRepair.location || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Priority">
                <Tag color={priorityOptions.find(p => p.value === selectedRepair.priority)?.color}>
                  {priorityOptions.find(p => p.value === selectedRepair.priority)?.label || selectedRepair.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColors[selectedRepair.status]}>
                  {selectedRepair.status?.replace('_', ' ').toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Submitted">
                {dayjs(selectedRepair.created_at).format('MMM DD, YYYY HH:mm')}
              </Descriptions.Item>
              {selectedRepair.updated_at && (
                <Descriptions.Item label="Last Updated">
                  {dayjs(selectedRepair.updated_at).format('MMM DD, YYYY HH:mm')}
                </Descriptions.Item>
              )}
            </Descriptions>

            <div>
              <Text strong>Description</Text>
              <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">
                {selectedRepair.description}
              </Paragraph>
            </div>

            {selectedRepair.notes && (
              <div>
                <Text strong className="flex items-center gap-2">
                  <MessageOutlined /> Admin Notes
                </Text>
                <Paragraph className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  {selectedRepair.notes}
                </Paragraph>
              </div>
            )}

            {parsePhotos(selectedRepair.photos).length > 0 && (
              <div>
                <Text strong>Photos</Text>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Image.PreviewGroup>
                    {parsePhotos(selectedRepair.photos).map((photo, index) => (
                      <Image
                        key={index}
                        width={100}
                        height={100}
                        src={photo}
                        className="object-cover rounded-lg"
                      />
                    ))}
                  </Image.PreviewGroup>
                </div>
              </div>
            )}

            {selectedRepair.assigned_to_name && (
              <div>
                <Text strong>Assigned To</Text>
                <Paragraph className="mt-1">
                  {selectedRepair.assigned_to_name}
                </Paragraph>
              </div>
            )}

            {/* Chat / Conversation Section */}
            <Divider orientation="left">
              <MessageOutlined className="mr-2" />
              Conversation
            </Divider>
            <RepairChat 
              repairId={selectedRepair.id} 
              isAdmin={isAdmin}
              userId={user?.id}
            />
          </div>
        )}
      </Drawer>

      {/* Edit Status Modal - Admin Only */}
      <Modal
        title="Update Repair Status"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          editForm.resetFields();
        }}
        footer={null}
        width={450}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateRepair}
          className="mt-4"
        >
          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: 'Please select status' }]}
          >
            <Select
              options={statusOptions}
              placeholder="Select status"
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Admin Notes"
            help="Add notes about the repair progress, parts ordered, etc."
          >
            <TextArea
              rows={4}
              placeholder="Add internal notes about this repair..."
            />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={updating}>
              Update Status
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RepairsPage;
