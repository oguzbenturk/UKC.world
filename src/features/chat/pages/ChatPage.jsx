import { MessageOutlined } from '@ant-design/icons';

const ChatPage = () => {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50 rounded-lg border border-gray-200">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageOutlined className="text-2xl text-sky-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Chat is currently unavailable</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          We're working on improvements to the chat experience. Please check back later.
        </p>
      </div>
    </div>
  );
};

export default ChatPage;
