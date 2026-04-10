import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, FlagOutlined } from '@ant-design/icons';
import { useKaiConversation, useFlagConversation } from '../hooks/useKaiAdmin';

const FlagDialog = ({ onSubmit, onCancel }) => {
  const [flagType, setFlagType] = useState('review');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Flag Conversation</h3>
        <div className="flex gap-2 mb-4">
          {['review', 'escalation', 'error', 'praise'].map((t) => (
            <button
              key={t}
              onClick={() => setFlagType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                flagType === t
                  ? 'bg-duotone-blue text-white border-duotone-blue'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          placeholder="Add a note (optional)..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none h-20 outline-none focus:border-duotone-blue/40"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={() => onSubmit({ flagType, note })}
            className="px-4 py-2 text-sm bg-duotone-blue text-white rounded-lg hover:bg-[#0097b0]"
          >
            Submit Flag
          </button>
        </div>
      </div>
    </div>
  );
};

export default function KaiConversationDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useKaiConversation(sessionId);
  const flagMutation = useFlagConversation();
  const [showFlagDialog, setShowFlagDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-400">Loading conversation...</div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-gray-400">Conversation not found</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/kai')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeftOutlined />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{data.userName}</h1>
            <p className="text-xs text-gray-400">
              {data.userRole} {data.userEmail ? `· ${data.userEmail}` : ''} · {data.messages?.length || 0} messages
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowFlagDialog(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <FlagOutlined /> Flag
        </button>
      </div>

      {/* Flags */}
      {data.flags?.length > 0 && (
        <div className="mb-4 space-y-2">
          {data.flags.map((f) => (
            <div key={f.id} className="flex items-start gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100 text-sm">
              <FlagOutlined className="text-amber-500 mt-0.5" />
              <div>
                <span className="font-medium text-amber-700">{f.flag_type}</span>
                <span className="text-amber-600 ml-2">{f.note || '(no note)'}</span>
                <span className="text-amber-400 ml-2 text-xs">
                  by {f.flagged_by_name} · {new Date(f.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat replay */}
      <div className="bg-slate-50 rounded-xl border border-gray-200 p-4 space-y-3">
        {data.messages?.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-duotone-blue flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0">
                  K
                </div>
              )}
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                isUser
                  ? 'bg-duotone-blue text-white rounded-br-sm'
                  : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.timestamp && (
                  <p className={`text-[10px] mt-1 text-right ${isUser ? 'text-white/50' : 'text-gray-400'}`}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-xs font-medium text-blue-600 mb-1">AI Summary</p>
          <p className="text-sm text-blue-800">{data.summary}</p>
        </div>
      )}

      {showFlagDialog && (
        <FlagDialog
          onCancel={() => setShowFlagDialog(false)}
          onSubmit={({ flagType, note }) => {
            flagMutation.mutate({ sessionId, flagType, note });
            setShowFlagDialog(false);
          }}
        />
      )}
    </div>
  );
}
