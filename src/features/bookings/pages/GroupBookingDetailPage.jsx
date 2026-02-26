/**
 * Group Booking Detail Page
 * 
 * Shows detailed view of a group booking:
 * - Event details
 * - Participants list
 * - Payment functionality
 * - Invite participants (if organizer)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Result,
  Descriptions,
  Modal,
  Input,
  Alert,
  Tag,
  Divider,
  Avatar,
  Table,
  message,
  Form,
  Select,
  Tooltip,
  Popconfirm
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  CurrencyEuroIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  EnvelopeIcon,
  TrashIcon,
  ArrowLeftIcon,
  CreditCardIcon,
  WalletIcon,
  ClipboardDocumentIcon,
  ShareIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { 
  getGroupBookingDetails, 
  inviteParticipants, 
  payForGroupBooking,
  payForAllParticipants,
  cancelGroupBooking,
  removeParticipant
} from '../services/groupBookingService';
import { useAuth } from '@/shared/hooks/useAuth';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const GroupBookingDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  
  // Invite modal
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteForm] = Form.useForm();
  const [inviting, setInviting] = useState(false);
  
  // Payment modal
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  
  // Cancel modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getGroupBookingDetails(id);
      setBooking(response.groupBooking);
      
      // Auto-open payment modal if ?pay=true
      if (searchParams.get('pay') === 'true') {
        setPaymentModalVisible(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load group booking');
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);
  
  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);
  
  const handleInvite = async (values) => {
    try {
      setInviting(true);
      
      // Parse email list
      const participants = values.emails
        .split(/[\n,]/)
        .map(line => line.trim())
        .filter(line => line)
        .map(email => ({ email }));
      
      if (participants.length === 0) {
        message.error('Please enter at least one email address');
        return;
      }
      
      const response = await inviteParticipants(id, participants);
      message.success(`${response.invitations?.length || 0} invitation(s) sent`);
      setInviteModalVisible(false);
      inviteForm.resetFields();
      fetchBooking();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to send invitations');
    } finally {
      setInviting(false);
    }
  };
  
  const handlePayment = async () => {
    try {
      setPaying(true);
      
      // Check if organizer paying for all
      if (booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer) {
        const result = await payForAllParticipants(id, paymentMethod);
        message.success(`Payment successful! Paid €${result.totalAmount?.toFixed(2)} for ${result.participantCount} participants.`);
      } else {
        await payForGroupBooking(id, paymentMethod);
        message.success('Payment successful!');
      }
      
      setPaymentModalVisible(false);
      fetchBooking();
    } catch (err) {
      message.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };
  
  const handleCancel = async () => {
    try {
      setCancelling(true);
      await cancelGroupBooking(id, cancelReason || null);
      message.success('Group booking cancelled');
      setCancelModalVisible(false);
      navigate('/student/group-bookings');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };
  
  const handleRemoveParticipant = async (participantId) => {
    try {
      await removeParticipant(id, participantId);
      message.success('Participant removed');
      fetchBooking();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to remove participant');
    }
  };
  
  const getStatusColor = (status) => {
    const colors = {
      'invited': 'blue',
      'accepted': 'cyan',
      'declined': 'red',
      'cancelled': 'red'
    };
    return colors[status] || 'default';
  };
  
  const getPaymentStatusColor = (status) => {
    const colors = {
      'pending': 'orange',
      'paid': 'green',
      'refunded': 'purple'
    };
    return colors[status] || 'default';
  };
  
  // Find current user's participant record
  const myParticipant = booking?.participants?.find(p => p.userId === user?.id);
  
  // Determine if payment is needed based on payment model
  const isOrganizerPaysModel = booking?.paymentModel === 'organizer_pays';
  const organizerNeedsToPay = isOrganizerPaysModel && booking?.isOrganizer && !booking?.organizerPaid;
  const participantNeedsToPay = !isOrganizerPaysModel && myParticipant?.paymentStatus === 'pending';
  const needsPayment = (organizerNeedsToPay || participantNeedsToPay) && booking?.status !== 'cancelled';
  
  // Calculate total for organizer_pays model
  const acceptedCount = booking?.participants?.filter(p => ['accepted', 'paid'].includes(p.status)).length || 0;
  const totalForOrganizer = acceptedCount * (booking?.pricePerPerson || 0);
  
  const participantColumns = [
    {
      title: 'Participant',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (name, record) => (
        <Space>
          <Avatar size="small" icon={<UserIcon className="w-4 h-4" />} />
          <div>
            <Text strong>{name || 'Pending'}</Text>
            {record.isOrganizer && (
              <Tag color="gold" className="ml-2">Organizer</Tag>
            )}
            <br />
            <Text type="secondary" className="text-xs">{record.email}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status}
        </Tag>
      )
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (status, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={getPaymentStatusColor(status)}>
            {status}
          </Tag>
          {status === 'paid' && record.amountPaid > 0 && (
            <Text type="secondary" className="text-xs">
              €{record.amountPaid?.toFixed(2)}
            </Text>
          )}
        </Space>
      )
    },
    ...(booking?.isOrganizer ? [{
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        !record.isOrganizer && (
          <Popconfirm
            title="Remove this participant?"
            description="If they've paid, they will be refunded."
            onConfirm={() => handleRemoveParticipant(record.id)}
            okText="Remove"
            cancelText="Cancel"
          >
            <Button 
              type="text" 
              danger 
              icon={<TrashIcon className="w-4 h-4" />}
            />
          </Popconfirm>
        )
      )
    }] : [])
  ];
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" tip="Loading group booking..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Result
          status="error"
          title="Error Loading Group Booking"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate('/student/group-bookings')}>
              Back to My Group Lessons
            </Button>
          }
        />
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Back Button */}
      <Button
        type="text"
        icon={<ArrowLeftIcon className="w-4 h-4" />}
        onClick={() => navigate('/student/group-bookings')}
        className="mb-4"
      >
        Back to Group Lessons
      </Button>
      
      {/* Header Card */}
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar 
              size={64} 
              className="bg-blue-100 text-blue-600"
              icon={<UserGroupIcon className="w-8 h-8" />}
            />
            <div>
              <Title level={3} className="mb-1">{booking.title}</Title>
              <Tag color="blue">{booking.serviceName}</Tag>
              <Tag color={getStatusColor(booking.status)}>
                {booking.status.replace('_', ' ')}
              </Tag>
              {booking.isOrganizer && (
                <Tag color="gold">You're Organizing</Tag>
              )}
              <Tag color={isOrganizerPaysModel ? 'purple' : 'cyan'}>
                {isOrganizerPaysModel ? 'Organizer Pays All' : 'Individual Payment'}
              </Tag>
            </div>
          </div>
          
          <div className="text-right">
            <Text className="text-2xl font-bold text-green-600 block">
              €{booking.pricePerPerson?.toFixed(2)}
            </Text>
            <Text type="secondary">per person</Text>
          </div>
        </div>
        
        {booking.description && (
          <Paragraph className="mt-4 text-gray-600">
            {booking.description}
          </Paragraph>
        )}
      </Card>
      
      {/* Payment Alert */}
      {needsPayment && (
        <Alert
          type="warning"
          showIcon
          message={organizerNeedsToPay ? "Pay for Your Group" : "Payment Required"}
          description={
            organizerNeedsToPay 
              ? `As the organizer, you'll pay for all ${acceptedCount} participant(s). Total: €${totalForOrganizer.toFixed(2)}`
              : "Please complete your payment to confirm your participation."
          }
          action={
            <Button 
              type="primary" 
              icon={<CreditCardIcon className="w-4 h-4" />}
              onClick={() => setPaymentModalVisible(true)}
            >
              {organizerNeedsToPay 
                ? `Pay All (€${totalForOrganizer.toFixed(2)})`
                : `Pay Now (€${booking.pricePerPerson?.toFixed(2)})`
              }
            </Button>
          }
          className="mb-4"
        />
      )}
      
      {/* Status Alert for Organizer */}
      {booking?.isOrganizer && booking.status === 'pending' && (
        <Alert
          type="info"
          showIcon
          message="Group Booking Status: Pending"
          description={
            <div className="space-y-2">
              <Text>Waiting for participants to accept invitations.</Text>
              <div className="mt-2">
                <Text strong>Accepted: </Text>
                <Text>{acceptedCount} of {booking.minParticipants} minimum required</Text>
              </div>
              {acceptedCount >= booking.minParticipants && (
                <div className="mt-2">
                  <Text type="success">✓ Minimum participants reached! You can submit for admin approval.</Text>
                </div>
              )}
              {acceptedCount < booking.minParticipants && (
                <div className="mt-2">
                  <Text type="warning">Need {booking.minParticipants - acceptedCount} more participant(s) to submit for approval.</Text>
                </div>
              )}
            </div>
          }
          action={
            acceptedCount >= booking.minParticipants && (
              <Button 
                type="primary"
                onClick={() => message.info('Submit for approval feature coming soon!')}
              >
                Submit for Approval
              </Button>
            )
          }
          className="mb-4"
        />
      )}
      
      {/* Status Alert for Non-Organizer */}
      {!booking?.isOrganizer && booking.status === 'pending' && (
        <Alert
          type="info"
          showIcon
          message="Group Booking Status: Pending"
          description="The organizer is collecting participants. Once everyone accepts and the booking is approved by admin, it will be confirmed."
          className="mb-4"
        />
      )}
      
      {/* Payment Model Info */}
      {isOrganizerPaysModel && !booking?.isOrganizer && (
        <Alert
          type="info"
          showIcon
          message="Organizer Pays"
          description="The organizer will pay for all participants. You don't need to pay individually."
          className="mb-4"
        />
      )}
      
      {/* Details */}
      <Card title="Event Details" className="mb-4">
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item 
            label={<Space><CalendarIcon className="w-4 h-4" /> Date</Space>}
          >
            <Text strong>
              {dayjs(booking.scheduledDate).format('dddd, MMMM D, YYYY')}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item 
            label={<Space><ClockIcon className="w-4 h-4" /> Time</Space>}
          >
            <Text strong>
              {booking.startTime}
              {booking.endTime && ` - ${booking.endTime}`}
            </Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Instructor">
            {booking.instructorName || 'To be assigned'}
          </Descriptions.Item>
          
          <Descriptions.Item label="Duration">
            {booking.durationHours > 0 ? `${booking.durationHours} hour(s)` : '-'}
          </Descriptions.Item>
          
          <Descriptions.Item label="Organizer">
            {booking.organizerName}
            <br />
            <Text type="secondary" className="text-xs">{booking.organizerEmail}</Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Participants">
            {booking.participantCount} / {booking.maxParticipants} (min: {booking.minParticipants})
          </Descriptions.Item>
          
          {booking.registrationDeadline && (
            <Descriptions.Item label="Registration Deadline">
              {dayjs(booking.registrationDeadline).format('MMM D, YYYY HH:mm')}
            </Descriptions.Item>
          )}
          
          {booking.paymentDeadline && (
            <Descriptions.Item label="Payment Deadline">
              {dayjs(booking.paymentDeadline).format('MMM D, YYYY HH:mm')}
            </Descriptions.Item>
          )}
        </Descriptions>
        
        {booking.notes && (
          <>
            <Divider />
            <Text strong>Notes:</Text>
            <Paragraph className="mt-2 text-gray-600">
              {booking.notes}
            </Paragraph>
          </>
        )}
      </Card>
      
      {/* Participants */}
      <Card 
        title={`Participants (${booking.participantCount}/${booking.maxParticipants})`}
        extra={
          booking.isOrganizer && booking.status !== 'cancelled' && (
            <Button
              type="primary"
              icon={<PlusIcon className="w-4 h-4" />}
              onClick={() => setInviteModalVisible(true)}
              disabled={booking.participantCount >= booking.maxParticipants}
            >
              Invite Friends
            </Button>
          )
        }
        className="mb-4"
      >
        <Table
          dataSource={booking.participants}
          columns={participantColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
        
        {/* Stats */}
        <div className="mt-4 flex gap-4 flex-wrap">
          <Tag color="blue">
            {booking.participants?.filter(p => p.status === 'accepted').length || 0} Accepted
          </Tag>
          <Tag color="orange">
            {booking.participants?.filter(p => p.status === 'invited').length || 0} Pending
          </Tag>
          <Tag color="green">
            {booking.paidCount} Paid
          </Tag>
        </div>
      </Card>
      
      {/* Share Invite Link */}
      {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
        <Card title={
          <Space>
            <ShareIcon className="w-4 h-4" />
            <span>Share Invite Link</span>
          </Space>
        } className="mb-4">
          <div className="space-y-3">
            <Text type="secondary" className="text-sm block">
              Share this link with friends to invite them to your group lesson. They can accept by clicking the link — even if they don't have an account yet.
            </Text>
            {(() => {
              // Find a participant with pending invitation token for the invite link
              const invitedParticipant = booking.participants?.find(p => p.invitationToken && p.status === 'invited');
              const baseUrl = window.location.origin;
              
              if (invitedParticipant) {
                const inviteLink = `${baseUrl}/group-invitation/${invitedParticipant.invitationToken}`;
                return (
                  <div className="flex gap-2">
                    <Input 
                      value={inviteLink}
                      readOnly
                      className="flex-1"
                      addonBefore={<LinkIcon className="w-4 h-4" />}
                    />
                    <Tooltip title="Copy to clipboard">
                      <Button
                        type="primary"
                        icon={<ClipboardDocumentIcon className="w-4 h-4" />}
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink).then(() => {
                            message.success('Invite link copied to clipboard!');
                          }).catch(() => {
                            // Fallback for older browsers
                            const textArea = document.createElement('textarea');
                            textArea.value = inviteLink;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            message.success('Invite link copied!');
                          });
                        }}
                      >
                        Copy Link
                      </Button>
                    </Tooltip>
                  </div>
                );
              }
              
              return (
                <Alert
                  type="info"
                  showIcon
                  message="No pending invite links"
                  description="Use 'Invite Friends' above to create invite links. Each invited person gets a unique link you can share."
                />
              );
            })()}

            {/* Show all invite links for all pending invitations */}
            {booking.participants?.filter(p => p.invitationToken && p.status === 'invited').length > 1 && (
              <div className="mt-2">
                <Text strong className="text-xs block mb-2">All pending invitation links:</Text>
                {booking.participants
                  .filter(p => p.invitationToken && p.status === 'invited')
                  .map(p => {
                    const link = `${window.location.origin}/group-invitation/${p.invitationToken}`;
                    return (
                      <div key={p.id} className="flex items-center gap-2 mb-1">
                        <Text type="secondary" className="text-xs truncate max-w-[150px]">
                          {p.email || p.fullName || 'Invited'}
                        </Text>
                        <Button
                          size="small"
                          type="link"
                          icon={<ClipboardDocumentIcon className="w-3 h-3" />}
                          onClick={() => {
                            navigator.clipboard.writeText(link);
                            message.success(`Link for ${p.email || 'participant'} copied!`);
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Card>
      )}
      
      {/* Actions */}
      {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
        <Card className="bg-gray-50">
          <div className="flex justify-between items-center">
            <Text type="secondary">Organizer Actions</Text>
            <Button
              danger
              onClick={() => setCancelModalVisible(true)}
            >
              Cancel Group Booking
            </Button>
          </div>
        </Card>
      )}
      
      {/* Invite Modal */}
      <Modal
        title="Invite Friends"
        open={inviteModalVisible}
        onCancel={() => setInviteModalVisible(false)}
        footer={null}
      >
        <Form form={inviteForm} onFinish={handleInvite} layout="vertical">
          <Alert
            type="info"
            message="Invitees will receive an email with a link to join"
            description="They'll need to create an account (if they don't have one) and pay for their spot."
            className="mb-4"
          />
          
          <Form.Item
            name="emails"
            label="Email Addresses"
            rules={[{ required: true, message: 'Please enter at least one email' }]}
          >
            <TextArea
              placeholder="Enter email addresses, one per line or comma-separated"
              rows={4}
            />
          </Form.Item>
          
          <div className="flex justify-end gap-2">
            <Button onClick={() => setInviteModalVisible(false)}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={inviting}
              icon={<EnvelopeIcon className="w-4 h-4" />}
            >
              Send Invitations
            </Button>
          </div>
        </Form>
      </Modal>
      
      {/* Payment Modal */}
      <Modal
        title={organizerNeedsToPay ? "Pay for All Participants" : "Complete Payment"}
        open={paymentModalVisible}
        onCancel={() => setPaymentModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setPaymentModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="pay"
            type="primary"
            loading={paying}
            onClick={handlePayment}
            icon={<CreditCardIcon className="w-4 h-4" />}
          >
            Pay €{organizerNeedsToPay ? totalForOrganizer.toFixed(2) : booking?.pricePerPerson?.toFixed(2)}
          </Button>
        ]}
      >
        <div className="py-4">
          {organizerNeedsToPay && (
            <Alert
              type="info"
              showIcon
              message="Organizer Payment"
              description={
                <div>
                  <p>You are paying for all {acceptedCount} participant(s):</p>
                  <p className="mt-2">
                    <strong>{acceptedCount} × €{booking?.pricePerPerson?.toFixed(2)} = €{totalForOrganizer.toFixed(2)}</strong>
                  </p>
                </div>
              }
              className="mb-4"
            />
          )}
          
          <Text className="block mb-4">
            Select your payment method:
          </Text>
          
          <Select
            value={paymentMethod}
            onChange={setPaymentMethod}
            className="w-full"
            size="large"
          >
            <Select.Option value="wallet">
              <Space>
                <WalletIcon className="w-4 h-4" />
                Pay from Wallet
              </Space>
            </Select.Option>
            <Select.Option value="external">
              <Space>
                <CreditCardIcon className="w-4 h-4" />
                External Payment (Cash/Card)
              </Space>
            </Select.Option>
          </Select>
          
          <Alert
            type="info"
            message="Wallet Payment"
            description="The amount will be deducted from your wallet balance."
            className="mt-4"
          />
        </div>
      </Modal>
      
      {/* Cancel Modal */}
      <Modal
        title="Cancel Group Booking"
        open={cancelModalVisible}
        onCancel={() => setCancelModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCancelModalVisible(false)}>
            Keep Booking
          </Button>,
          <Button
            key="confirm"
            danger
            loading={cancelling}
            onClick={handleCancel}
          >
            Cancel Booking
          </Button>
        ]}
      >
        <Alert
          type="warning"
          message="This action cannot be undone"
          description="All participants will be notified and refunded if they've paid."
          className="mb-4"
        />
        <TextArea
          placeholder="(Optional) Reason for cancellation..."
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
          rows={3}
        />
      </Modal>
    </div>
  );
};

export default GroupBookingDetailPage;
