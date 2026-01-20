import { useState, useCallback, useMemo } from 'react';
import { 
  UserAddOutlined, 
  UserDeleteOutlined, 
  CheckOutlined, 
  CloseOutlined,
  SearchOutlined,
  TeamOutlined,
  SendOutlined,
  ClockCircleOutlined,
  StopOutlined
} from '@ant-design/icons';
import { 
  Card, 
  Button, 
  Input, 
  List, 
  Avatar, 
  Tabs, 
  Empty, 
  Spin, 
  message, 
  Modal, 
  Typography,
  Badge,
  Tooltip,
  Space
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';
import { setDocumentTitle, setMetaTag, setOgTag, setLinkTag } from '@/shared/utils/seo';

const { Text } = Typography;
const { Search } = Input;

// API Functions
const fetchFriends = async () => {
  const response = await apiClient.get('/relationships/friends');
  return response.data;
};

const fetchPendingRequests = async () => {
  const response = await apiClient.get('/relationships/pending');
  return response.data;
};

const fetchSentRequests = async () => {
  const response = await apiClient.get('/relationships/sent');
  return response.data;
};

const searchUsers = async (query) => {
  if (!query || query.length < 2) return [];
  const response = await apiClient.get('/users/customers/list', {
    params: { q: query, limit: 20 }
  });
  return response.data;
};

// Custom hook for friend-related mutations
const useFriendMutations = (queryClient, callbacks = {}) => {
  const sendRequest = useMutation({
    mutationFn: async ({ receiverId, requestMessage }) => {
      const response = await apiClient.post('/relationships/request', { 
        receiverId, 
        message: requestMessage 
      });
      return response.data;
    },
    onSuccess: () => {
      message.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'sent'] });
      callbacks.onSendSuccess?.();
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to send request');
    }
  });

  const acceptRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.post(`/relationships/${relationshipId}/accept`);
      return response.data;
    },
    onSuccess: () => {
      message.success('Friend request accepted!');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'pending'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to accept request');
    }
  });

  const declineRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.post(`/relationships/${relationshipId}/decline`);
      return response.data;
    },
    onSuccess: () => {
      message.success('Friend request declined');
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'pending'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to decline request');
    }
  });

  const cancelRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.delete(`/relationships/${relationshipId}/cancel`);
      return response.data;
    },
    onSuccess: () => {
      message.success('Friend request cancelled');
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'sent'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to cancel request');
    }
  });

  const removeFriend = useMutation({
    mutationFn: async (friendId) => {
      const response = await apiClient.delete(`/relationships/friend/${friendId}`);
      return response.data;
    },
    onSuccess: () => {
      message.success('Friend removed');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to remove friend');
    }
  });

  const blockUser = useMutation({
    mutationFn: async (userId) => {
      const response = await apiClient.post(`/relationships/block/${userId}`);
      return response.data;
    },
    onSuccess: () => {
      message.success('User blocked');
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || 'Failed to block user');
    }
  });

  return { sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend, blockUser };
};

// Friend List Item Component
const FriendListItem = ({ friend, onRemove, onBlock }) => (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Tooltip key="remove" title="Remove friend">
        <Button type="text" danger icon={<UserDeleteOutlined />} onClick={() => onRemove(friend)} />
      </Tooltip>,
      <Tooltip key="block" title="Block user">
        <Button 
          type="text" 
          icon={<StopOutlined />}
          onClick={() => onBlock(friend.id, `${friend.first_name} ${friend.last_name}`)}
          className="text-slate-400 hover:text-red-500"
        />
      </Tooltip>
    ]}
  >
    <List.Item.Meta
      avatar={
        <Avatar size={48} src={friend.avatar_url} className="bg-gradient-to-br from-sky-400 to-indigo-500">
          {friend.first_name?.[0]}{friend.last_name?.[0]}
        </Avatar>
      }
      title={<span className="font-medium text-slate-800 dark:text-white">{friend.first_name} {friend.last_name}</span>}
      description={<Text type="secondary" className="text-sm">{friend.email}</Text>}
    />
  </List.Item>
);

// Pending Request Item Component
const PendingRequestItem = ({ request, onAccept, onDecline, isAccepting, isDeclining }) => (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Button 
        key="accept" type="primary" icon={<CheckOutlined />}
        onClick={() => onAccept(request.id)} loading={isAccepting}
        className="bg-green-500 hover:bg-green-600 border-green-500"
      >Accept</Button>,
      <Button key="decline" danger icon={<CloseOutlined />} onClick={() => onDecline(request.id)} loading={isDeclining}>
        Decline
      </Button>
    ]}
  >
    <List.Item.Meta
      avatar={
        <Avatar size={48} src={request.sender?.avatar_url} className="bg-gradient-to-br from-amber-400 to-orange-500">
          {request.sender?.first_name?.[0]}{request.sender?.last_name?.[0]}
        </Avatar>
      }
      title={<span className="font-medium text-slate-800 dark:text-white">{request.sender?.first_name} {request.sender?.last_name}</span>}
      description={
        <div>
          <Text type="secondary" className="text-sm block">{request.sender?.email}</Text>
          {request.message && <Text className="text-sm text-slate-600 dark:text-slate-400 italic mt-1 block">&quot;{request.message}&quot;</Text>}
        </div>
      }
    />
  </List.Item>
);

// Sent Request Item Component  
const SentRequestItem = ({ request, onCancel, isCancelling }) => (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Tooltip key="cancel" title="Cancel request">
        <Button type="text" danger icon={<CloseOutlined />} onClick={() => onCancel(request.id)} loading={isCancelling}>
          Cancel
        </Button>
      </Tooltip>
    ]}
  >
    <List.Item.Meta
      avatar={
        <Avatar size={48} src={request.receiver?.avatar_url} className="bg-gradient-to-br from-slate-400 to-slate-500">
          {request.receiver?.first_name?.[0]}{request.receiver?.last_name?.[0]}
        </Avatar>
      }
      title={<span className="font-medium text-slate-800 dark:text-white">{request.receiver?.first_name} {request.receiver?.last_name}</span>}
      description={
        <div>
          <Text type="secondary" className="text-sm block">{request.receiver?.email}</Text>
          <Space className="mt-1"><ClockCircleOutlined className="text-amber-500" /><Text type="secondary" className="text-xs">Pending</Text></Space>
        </div>
      }
    />
  </List.Item>
);

// Search Result Item Component
const SearchResultItem = ({ userResult, onAdd }) => (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[<Button key="add" type="primary" icon={<UserAddOutlined />} onClick={() => onAdd(userResult)}>Add Friend</Button>]}
  >
    <List.Item.Meta
      avatar={
        <Avatar size={48} src={userResult.avatar_url} className="bg-gradient-to-br from-cyan-400 to-blue-500">
          {userResult.first_name?.[0]}{userResult.last_name?.[0]}
        </Avatar>
      }
      title={<span className="font-medium text-slate-800 dark:text-white">{userResult.first_name} {userResult.last_name}</span>}
      description={<Text type="secondary" className="text-sm">{userResult.email}</Text>}
    />
  </List.Item>
);

// Send Request Modal Component
const SendRequestModal = ({ visible, selectedUser, requestMessage, onMessageChange, onConfirm, onCancel, isLoading }) => (
  <Modal
    title={<div className="flex items-center gap-2"><UserAddOutlined className="text-sky-500" /><span>Send Friend Request</span></div>}
    open={visible}
    onCancel={onCancel}
    onOk={onConfirm}
    okText="Send Request"
    okButtonProps={{ loading: isLoading, icon: <SendOutlined /> }}
  >
    {selectedUser && (
      <div className="py-4">
        <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Avatar size={48} src={selectedUser.avatar_url} className="bg-gradient-to-br from-sky-400 to-indigo-500">
            {selectedUser.first_name?.[0]}{selectedUser.last_name?.[0]}
          </Avatar>
          <div>
            <Text strong className="block">{selectedUser.first_name} {selectedUser.last_name}</Text>
            <Text type="secondary" className="text-sm">{selectedUser.email}</Text>
          </div>
        </div>
        <div>
          <Text className="text-slate-600 dark:text-slate-300 mb-2 block">Add a message (optional):</Text>
          <Input.TextArea
            value={requestMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Hi! I'd like to connect with you for group bookings..."
            rows={3}
            maxLength={200}
            showCount
          />
        </div>
      </div>
    )}
  </Modal>
);

// Main Page Component
const StudentFriendsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Set SEO metadata
  setDocumentTitle('Friends • Plannivo');
  setMetaTag('description', 'Manage your friends to create group bookings together.');
  setOgTag('og:title', 'Friends • Plannivo');
  setOgTag('og:description', 'Manage your friends to create group bookings together.');
  setOgTag('og:url', (typeof window !== 'undefined' ? window.location.origin : 'https://plannivo.com') + '/student/friends');
  setLinkTag('canonical', '/student/friends');

  const clearModalState = useCallback(() => {
    setShowRequestModal(false);
    setSelectedUser(null);
    setRequestMessage('');
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  // Queries
  const { data: friends = [], isLoading: loadingFriends } = useQuery({ queryKey: ['friends'], queryFn: fetchFriends });
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery({ queryKey: ['friendRequests', 'pending'], queryFn: fetchPendingRequests });
  const { data: sentRequests = [], isLoading: loadingSent } = useQuery({ queryKey: ['friendRequests', 'sent'], queryFn: fetchSentRequests });

  // Mutations
  const mutations = useFriendMutations(queryClient, { onSendSuccess: clearModalState });

  // Search handler
  const handleSearch = useCallback(async (value) => {
    setSearchQuery(value);
    if (!value || value.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchUsers(value);
      const friendIds = friends.map(f => f.id);
      const pendingIds = pendingRequests.map(r => r.sender_id);
      const sentIds = sentRequests.map(r => r.receiver_id);
      setSearchResults(results.filter(u => u.id !== user?.id && !friendIds.includes(u.id) && !pendingIds.includes(u.id) && !sentIds.includes(u.id)));
    } catch {
      message.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  }, [friends, pendingRequests, sentRequests, user?.id]);

  const handleRemoveFriend = useCallback((friend) => {
    Modal.confirm({
      title: 'Remove Friend',
      content: `Are you sure you want to remove ${friend.first_name} ${friend.last_name} from your friends?`,
      okText: 'Remove', okType: 'danger', cancelText: 'Cancel',
      onOk: () => mutations.removeFriend.mutate(friend.id)
    });
  }, [mutations.removeFriend]);

  const handleBlockUser = useCallback((userId, name) => {
    Modal.confirm({
      title: 'Block User',
      content: `Are you sure you want to block ${name}? They won't be able to send you friend requests or invite you to group bookings.`,
      okText: 'Block', okType: 'danger', cancelText: 'Cancel',
      onOk: () => mutations.blockUser.mutate(userId)
    });
  }, [mutations.blockUser]);

  const handleSendRequest = useCallback((userToAdd) => {
    setSelectedUser(userToAdd);
    setShowRequestModal(true);
  }, []);

  const confirmSendRequest = useCallback(() => {
    if (!selectedUser) return;
    mutations.sendRequest.mutate({ receiverId: selectedUser.id, requestMessage });
  }, [selectedUser, requestMessage, mutations.sendRequest]);

  // Tab items
  const tabItems = useMemo(() => [
    {
      key: 'friends',
      label: <span className="flex items-center gap-2"><TeamOutlined />Friends{friends.length > 0 && <Badge count={friends.length} showZero={false} className="ml-1" />}</span>,
      children: loadingFriends ? <div className="flex justify-center py-12"><Spin size="large" /></div> : 
        friends.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div className="text-center"><p className="text-slate-500 mb-4">You don&apos;t have any friends yet</p><p className="text-sm text-slate-400">Search for users above to send friend requests</p></div>} /> :
        <List itemLayout="horizontal" dataSource={friends} renderItem={(friend) => <FriendListItem friend={friend} onRemove={handleRemoveFriend} onBlock={handleBlockUser} />} />
    },
    {
      key: 'pending',
      label: <span className="flex items-center gap-2"><ClockCircleOutlined />Requests{pendingRequests.length > 0 && <Badge count={pendingRequests.length} className="ml-1" />}</span>,
      children: loadingPending ? <div className="flex justify-center py-12"><Spin size="large" /></div> :
        pendingRequests.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending friend requests" /> :
        <List itemLayout="horizontal" dataSource={pendingRequests} renderItem={(request) => <PendingRequestItem request={request} onAccept={(id) => mutations.acceptRequest.mutate(id)} onDecline={(id) => mutations.declineRequest.mutate(id)} isAccepting={mutations.acceptRequest.isPending} isDeclining={mutations.declineRequest.isPending} />} />
    },
    {
      key: 'sent',
      label: <span className="flex items-center gap-2"><SendOutlined />Sent{sentRequests.length > 0 && <Badge count={sentRequests.length} showZero={false} className="ml-1" />}</span>,
      children: loadingSent ? <div className="flex justify-center py-12"><Spin size="large" /></div> :
        sentRequests.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sent requests" /> :
        <List itemLayout="horizontal" dataSource={sentRequests} renderItem={(request) => <SentRequestItem request={request} onCancel={(id) => mutations.cancelRequest.mutate(id)} isCancelling={mutations.cancelRequest.isPending} />} />
    }
  ], [friends, pendingRequests, sentRequests, loadingFriends, loadingPending, loadingSent, handleRemoveFriend, handleBlockUser, mutations]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
            <TeamOutlined className="text-xl" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Friends</h1>
        </div>
        <p className="ml-13 text-slate-500 dark:text-slate-400">Manage your friends to create group bookings together.</p>
      </div>

      <Card className="mb-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <Text strong className="text-slate-700 dark:text-slate-200 mb-2 block">Find Friends</Text>
            <Search placeholder="Search by name or email..." allowClear enterButton={<SearchOutlined />} size="large" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} onSearch={handleSearch} loading={isSearching} />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2">
              <Text type="secondary" className="text-sm mb-2 block">{searchResults.length} user{searchResults.length !== 1 ? 's' : ''} found</Text>
              <List itemLayout="horizontal" dataSource={searchResults} renderItem={(userResult) => <SearchResultItem userResult={userResult} onAdd={handleSendRequest} />} className="border rounded-lg" />
            </div>
          )}
          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No users found matching your search" className="py-4" />}
        </div>
      </Card>

      <Card className="shadow-sm">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="friends-tabs" />
      </Card>

      <SendRequestModal
        visible={showRequestModal}
        selectedUser={selectedUser}
        requestMessage={requestMessage}
        onMessageChange={setRequestMessage}
        onConfirm={confirmSendRequest}
        onCancel={() => { setShowRequestModal(false); setSelectedUser(null); setRequestMessage(''); }}
        isLoading={mutations.sendRequest.isPending}
      />
    </div>
  );
};

export default StudentFriendsPage;
