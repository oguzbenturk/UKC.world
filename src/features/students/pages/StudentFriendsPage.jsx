import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['student']);

  const sendRequest = useMutation({
    mutationFn: async ({ receiverId, requestMessage }) => {
      const response = await apiClient.post('/relationships/request', {
        receiverId,
        message: requestMessage
      });
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.requestSent'));
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'sent'] });
      callbacks.onSendSuccess?.();
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.requestSentError'));
    }
  });

  const acceptRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.post(`/relationships/${relationshipId}/accept`);
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.requestAccepted'));
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'pending'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.requestAcceptedError'));
    }
  });

  const declineRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.post(`/relationships/${relationshipId}/decline`);
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.requestDeclined'));
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'pending'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.requestDeclinedError'));
    }
  });

  const cancelRequest = useMutation({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.delete(`/relationships/${relationshipId}/cancel`);
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.requestCancelled'));
      queryClient.invalidateQueries({ queryKey: ['friendRequests', 'sent'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.requestCancelledError'));
    }
  });

  const removeFriend = useMutation({
    mutationFn: async (friendId) => {
      const response = await apiClient.delete(`/relationships/friend/${friendId}`);
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.friendRemoved'));
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.friendRemovedError'));
    }
  });

  const blockUser = useMutation({
    mutationFn: async (userId) => {
      const response = await apiClient.post(`/relationships/block/${userId}`);
      return response.data;
    },
    onSuccess: () => {
      message.success(t('student:friends.toasts.userBlocked'));
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
    onError: (error) => {
      message.error(error.response?.data?.error || t('student:friends.toasts.userBlockedError'));
    }
  });

  return { sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend, blockUser };
};

// Friend List Item Component
const FriendListItem = ({ friend, onRemove, onBlock }) => {
  const { t } = useTranslation(['student']);
  return (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Tooltip key="remove" title={t('student:friends.tooltips.removeFriend')}>
        <Button type="text" danger icon={<UserDeleteOutlined />} onClick={() => onRemove(friend)} />
      </Tooltip>,
      <Tooltip key="block" title={t('student:friends.tooltips.blockUser')}>
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
};

// Pending Request Item Component
const PendingRequestItem = ({ request, onAccept, onDecline, isAccepting, isDeclining }) => {
  const { t } = useTranslation(['student']);
  return (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Button
        key="accept" type="primary" icon={<CheckOutlined />}
        onClick={() => onAccept(request.id)} loading={isAccepting}
        className="bg-green-500 hover:bg-green-600 border-green-500"
      >{t('student:friends.buttons.accept')}</Button>,
      <Button key="decline" danger icon={<CloseOutlined />} onClick={() => onDecline(request.id)} loading={isDeclining}>
        {t('student:friends.buttons.decline')}
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
};

// Sent Request Item Component
const SentRequestItem = ({ request, onCancel, isCancelling }) => {
  const { t } = useTranslation(['student']);
  return (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[
      <Tooltip key="cancel" title={t('student:friends.tooltips.cancelRequest')}>
        <Button type="text" danger icon={<CloseOutlined />} onClick={() => onCancel(request.id)} loading={isCancelling}>
          {t('student:friends.buttons.cancel')}
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
          <Space className="mt-1"><ClockCircleOutlined className="text-amber-500" /><Text type="secondary" className="text-xs">{t('student:friends.pending')}</Text></Space>
        </div>
      }
    />
  </List.Item>
  );
};

// Search Result Item Component
const SearchResultItem = ({ userResult, onAdd }) => {
  const { t } = useTranslation(['student']);
  return (
  <List.Item
    className="!px-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    actions={[<Button key="add" type="primary" icon={<UserAddOutlined />} onClick={() => onAdd(userResult)}>{t('student:friends.buttons.addFriend')}</Button>]}
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
};

// Send Request Modal Component
const SendRequestModal = ({ visible, selectedUser, requestMessage, onMessageChange, onConfirm, onCancel, isLoading }) => {
  const { t } = useTranslation(['student']);
  return (
  <Modal
    title={<div className="flex items-center gap-2"><UserAddOutlined className="text-sky-500" /><span>{t('student:friends.sendRequestModal.title')}</span></div>}
    open={visible}
    onCancel={onCancel}
    onOk={onConfirm}
    okText={t('student:friends.buttons.sendRequest')}
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
          <Text className="text-slate-600 dark:text-slate-300 mb-2 block">{t('student:friends.sendRequestModal.messageLabel')}</Text>
          <Input.TextArea
            value={requestMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder={t('student:friends.sendRequestModal.messagePlaceholder')}
            rows={3}
            maxLength={200}
            showCount
          />
        </div>
      </div>
    )}
  </Modal>
  );
};

// Main Page Component
const StudentFriendsPage = () => {
  const { t } = useTranslation(['student']);
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
  setDocumentTitle(t('student:friends.seoTitle'));
  setMetaTag('description', t('student:friends.seoDescription'));
  setOgTag('og:title', t('student:friends.seoTitle'));
  setOgTag('og:description', t('student:friends.seoDescription'));
  setOgTag('og:url', (typeof window !== 'undefined' ? window.location.origin : 'https://ukc.plannivo.com') + '/student/friends');
  setLinkTag('canonical', '/student/friends');

  const clearModalState = useCallback(() => {
    setShowRequestModal(false);
    setSelectedUser(null);
    setRequestMessage('');
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  // Queries
  const { data: friends = [], isLoading: loadingFriends } = useQuery({ queryKey: ['friends'], queryFn: fetchFriends, staleTime: 120_000 });
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery({ queryKey: ['friendRequests', 'pending'], queryFn: fetchPendingRequests, staleTime: 60_000 });
  const { data: sentRequests = [], isLoading: loadingSent } = useQuery({ queryKey: ['friendRequests', 'sent'], queryFn: fetchSentRequests, staleTime: 60_000 });

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
      message.error(t('student:friends.toasts.searchError'));
    } finally {
      setIsSearching(false);
    }
  }, [friends, pendingRequests, sentRequests, user?.id]);

  const handleRemoveFriend = useCallback((friend) => {
    Modal.confirm({
      title: t('student:friends.confirmRemove.title'),
      content: t('student:friends.confirmRemove.content', { name: `${friend.first_name} ${friend.last_name}` }),
      okText: t('student:friends.confirmRemove.okText'), okType: 'danger', cancelText: t('student:friends.confirmRemove.cancelText'),
      onOk: () => mutations.removeFriend.mutate(friend.id)
    });
  }, [mutations.removeFriend, t]);

  const handleBlockUser = useCallback((userId, name) => {
    Modal.confirm({
      title: t('student:friends.confirmBlock.title'),
      content: t('student:friends.confirmBlock.content', { name }),
      okText: t('student:friends.confirmBlock.okText'), okType: 'danger', cancelText: t('student:friends.confirmBlock.cancelText'),
      onOk: () => mutations.blockUser.mutate(userId)
    });
  }, [mutations.blockUser, t]);

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
      label: <span className="flex items-center gap-2"><TeamOutlined />{t('student:friends.tabs.friends')}{friends.length > 0 && <Badge count={friends.length} showZero={false} className="ml-1" />}</span>,
      children: loadingFriends ? <div className="flex justify-center py-12"><Spin size="large" /></div> :
        friends.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div className="text-center"><p className="text-slate-500 mb-4">{t('student:friends.emptyFriends')}</p><p className="text-sm text-slate-400">{t('student:friends.emptyFriendsHint')}</p></div>} /> :
        <List itemLayout="horizontal" dataSource={friends} renderItem={(friend) => <FriendListItem friend={friend} onRemove={handleRemoveFriend} onBlock={handleBlockUser} />} />
    },
    {
      key: 'pending',
      label: <span className="flex items-center gap-2"><ClockCircleOutlined />{t('student:friends.tabs.requests')}{pendingRequests.length > 0 && <Badge count={pendingRequests.length} className="ml-1" />}</span>,
      children: loadingPending ? <div className="flex justify-center py-12"><Spin size="large" /></div> :
        pendingRequests.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('student:friends.noPendingRequests')} /> :
        <List itemLayout="horizontal" dataSource={pendingRequests} renderItem={(request) => <PendingRequestItem request={request} onAccept={(id) => mutations.acceptRequest.mutate(id)} onDecline={(id) => mutations.declineRequest.mutate(id)} isAccepting={mutations.acceptRequest.isPending} isDeclining={mutations.declineRequest.isPending} />} />
    },
    {
      key: 'sent',
      label: <span className="flex items-center gap-2"><SendOutlined />{t('student:friends.tabs.sent')}{sentRequests.length > 0 && <Badge count={sentRequests.length} showZero={false} className="ml-1" />}</span>,
      children: loadingSent ? <div className="flex justify-center py-12"><Spin size="large" /></div> :
        sentRequests.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('student:friends.noSentRequests')} /> :
        <List itemLayout="horizontal" dataSource={sentRequests} renderItem={(request) => <SentRequestItem request={request} onCancel={(id) => mutations.cancelRequest.mutate(id)} isCancelling={mutations.cancelRequest.isPending} />} />
    }
  ], [friends, pendingRequests, sentRequests, loadingFriends, loadingPending, loadingSent, handleRemoveFriend, handleBlockUser, mutations, t]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-0">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
            <TeamOutlined className="text-xl" />
          </div>
          <h1 className="text-2xl font-duotone-bold-extended text-slate-900 dark:text-white">{t('student:friends.pageTitle')}</h1>
        </div>
        <p className="ml-13 text-slate-500 dark:text-slate-400">{t('student:friends.pageSubtitle')}</p>
      </div>

      <Card className="mb-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <Text strong className="text-slate-700 dark:text-slate-200 mb-2 block">{t('student:friends.findFriends')}</Text>
            <Search placeholder={t('student:friends.searchPlaceholder')} allowClear enterButton={<SearchOutlined />} size="large" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} onSearch={handleSearch} loading={isSearching} />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2">
              <Text type="secondary" className="text-sm mb-2 block">{t('student:friends.usersFound', { count: searchResults.length })}</Text>
              <List itemLayout="horizontal" dataSource={searchResults} renderItem={(userResult) => <SearchResultItem userResult={userResult} onAdd={handleSendRequest} />} className="border rounded-lg" />
            </div>
          )}
          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('student:friends.noUsersFound')} className="py-4" />}
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
