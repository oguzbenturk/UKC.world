/**
 * ChatPage Component
 * 
 * Main chat page with modern, calm design
 * Layout: Split view with conversation list and chat window
 * Mobile responsive with hamburger menu
 */

import { useState, useCallback } from 'react';
import { Modal, Form, Input, Select, message as antdMessage, Drawer } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import ChatSidebar from '../components/ChatSidebar';
import ChatWindow from '../components/ChatWindow';
import { useChat } from '../hooks/useChat';
import ChatApi from '../services/chatApi';

const ChatPage = () => {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [form] = Form.useForm();
  const { socket, joinConversation, sendTyping } = useChat();

  const refreshConversations = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    setMobileMenuOpen(false); // Close mobile menu when selecting
    if (socket && conversation?.id) {
      joinConversation(conversation.id);
    }
  };

  const handleTyping = () => {
    if (selectedConversation?.id) {
      sendTyping(selectedConversation.id);
    }
  };

  const handleCreateConversation = () => {
    setShowNewConversationModal(true);
    setMobileMenuOpen(false);
  };

  const handleSubmitNewConversation = async (values) => {
    try {
      setCreating(true);
      const { type, recipientId, name, welcomeMessage } = values;

      let newConversation;

      if (type === 'direct') {
        newConversation = await ChatApi.createDirectConversation(recipientId);
      } else if (type === 'group') {
        newConversation = await ChatApi.createGroup(name, [], welcomeMessage);
      } else {
        newConversation = await ChatApi.createChannel(name, [], welcomeMessage);
      }

      antdMessage.success('Conversation created');
      setShowNewConversationModal(false);
      form.resetFields();
      refreshConversations();
      handleSelectConversation(newConversation);
    } catch (error) {
      antdMessage.error(error.response?.data?.error || 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  };

  const handleConversationDeleted = useCallback((deletedId) => {
    if (selectedConversation?.id === deletedId) {
      setSelectedConversation(null);
    }
    refreshConversations();
  }, [selectedConversation, refreshConversations]);

  return (
    <div className="h-full max-h-[calc(100vh-120px)] flex bg-slate-50 rounded-lg overflow-hidden border border-gray-200">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:block w-72 flex-shrink-0 h-full border-r border-gray-200 bg-white">
        <ChatSidebar
          key={refreshKey}
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
          onCreateConversation={handleCreateConversation}
        />
      </div>

      {/* Mobile Sidebar Drawer */}
      <Drawer
        title="Conversations"
        placement="left"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        width={300}
        className="md:hidden"
        styles={{ body: { padding: 0 } }}
      >
        <ChatSidebar
          key={refreshKey}
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
          onCreateConversation={handleCreateConversation}
        />
      </Drawer>

      {/* Chat Window */}
      <div className="flex-1 h-full flex flex-col">
        {/* Mobile Header with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MenuOutlined className="text-lg" />
          </button>
          {selectedConversation ? (
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 truncate">
                {selectedConversation.name || 'Unnamed'}
              </h3>
              <p className="text-xs text-gray-400">
                {selectedConversation.type === 'direct' ? 'Direct message' : 
                 `${selectedConversation.participant_count || 0} members`}
              </p>
            </div>
          ) : (
            <span className="text-gray-500 text-sm">Select a conversation</span>
          )}
        </div>

        <div className="flex-1 min-h-0">
          <ChatWindow
            conversation={selectedConversation}
            socket={socket}
            onTyping={handleTyping}
            onStopTyping={() => {}}
            hideMobileHeader={true}
            onConversationDeleted={handleConversationDeleted}
          />
        </div>
      </div>

      {/* New Conversation Modal - Clean design */}
      <Modal
        title={<span className="text-lg font-semibold">New Conversation</span>}
        open={showNewConversationModal}
        onCancel={() => {
          setShowNewConversationModal(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Create"
        okButtonProps={{ loading: creating, className: 'bg-slate-700 hover:bg-slate-800' }}
        cancelButtonProps={{ className: 'hover:bg-gray-50' }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmitNewConversation}
          className="mt-4"
        >
          <Form.Item
            name="type"
            label={<span className="text-gray-600 font-medium">Type</span>}
            rules={[{ required: true, message: 'Please select a type' }]}
            initialValue="direct"
          >
            <Select className="rounded-lg">
              <Select.Option value="direct">💬 Direct Message</Select.Option>
              <Select.Option value="group">👥 Group Chat</Select.Option>
              <Select.Option value="channel">📢 Channel</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('type');

              if (type === 'direct') {
                return (
                  <Form.Item
                    name="recipientId"
                    label={<span className="text-gray-600 font-medium">Recipient</span>}
                    rules={[{ required: true, message: 'Please enter recipient user ID' }]}
                    extra={<span className="text-gray-400 text-xs">Enter the user&apos;s UUID</span>}
                  >
                    <Input placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000" className="rounded-lg" />
                  </Form.Item>
                );
              }

              return (
                <>
                  <Form.Item
                    name="name"
                    label={<span className="text-gray-600 font-medium">Name</span>}
                    rules={[{ required: true, message: 'Please enter a name' }]}
                  >
                    <Input placeholder={`Enter ${type} name`} className="rounded-lg" />
                  </Form.Item>
                  
                  <Form.Item
                    name="welcomeMessage"
                    label={<span className="text-gray-600 font-medium">Welcome Message (Optional)</span>}
                    extra={<span className="text-gray-400 text-xs">This message will be sent when the {type} is created to explain its purpose</span>}
                  >
                    <Input.TextArea 
                      placeholder={`e.g., "Welcome to the ${type}! Use this space to..."`}
                      className="rounded-lg" 
                      rows={3}
                    />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChatPage;
