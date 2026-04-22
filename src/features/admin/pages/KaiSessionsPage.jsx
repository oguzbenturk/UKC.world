import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tag, Button, Drawer, Input, Select, Switch, Spin, Empty, Avatar, Tooltip,
} from 'antd';
import {
  RobotOutlined, UserOutlined, ExclamationCircleOutlined,
  SearchOutlined, ReloadOutlined, MessageOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import apiClient from '@/shared/services/apiClient';

dayjs.extend(relativeTime);

const { Search } = Input;

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchSessions(params) {
  const { data } = await apiClient.get('/admin/kai/sessions', { params });
  return data;
}

async function fetchSession(sessionId) {
  const { data } = await apiClient.get(`/admin/kai/sessions/${sessionId}`);
  return data.session;
}

async function fetchStats() {
  const { data } = await apiClient.get('/admin/kai/stats');
  return data.stats;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UNANSWERED_PHRASES = [
  'bilgim yok', 'bilmiyorum', 'yardımcı olamıyorum',
  'bu konuda bilgim', 'cevap veremiyorum', 'whatsapp',
  "i don't have information", "i cannot help", "i don't know",
  'cannot assist', 'unable to help',
];

function isUnanswered(text = '') {
  const lower = text.toLowerCase();
  return UNANSWERED_PHRASES.some((p) => lower.includes(p));
}

const roleColor = {
  outsider: 'default',
  student: 'blue',
  instructor: 'cyan',
  admin: 'red',
  manager: 'purple',
};

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats, loading }) {
  const { t } = useTranslation(['admin']);
  if (loading) return <div className="h-20 flex items-center justify-center"><Spin /></div>;
  if (!stats) return null;

  const items = [
    { label: t('admin:kai.stats.totalSessions'),  value: stats.total_sessions,      color: 'text-slate-700' },
    { label: t('admin:kai.stats.totalMessages'),  value: stats.total_messages,      color: 'text-sky-600'   },
    { label: t('admin:kai.stats.outsider'),        value: stats.outsider_sessions,   color: 'text-slate-500' },
    { label: t('admin:kai.stats.student'),         value: stats.student_sessions,    color: 'text-blue-600'  },
    { label: t('admin:kai.stats.staffAdmin'),      value: stats.staff_sessions,      color: 'text-cyan-600'  },
    { label: t('admin:kai.stats.hasUnanswered'),   value: stats.unanswered_sessions, color: 'text-red-500'   },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
      {items.map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 text-center">
          <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Session row / mobile card ─────────────────────────────────────────────────

function SessionRow({ s, onOpen }) {
  const { t } = useTranslation(['admin']);
  const preview = typeof s.last_user_message === 'string' ? s.last_user_message : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(s.session_id)}
      className={`w-full text-left rounded-xl border shadow-sm p-3 mb-2 transition-colors hover:border-sky-300 hover:bg-sky-50
        ${s.has_unanswered ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white'}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-800 truncate">
              {s.name || s.email || 'Anonymous'}
            </span>
            <Tag color={roleColor[s.user_role] || 'default'} className="text-xs">
              {s.user_role}
            </Tag>
            {s.has_unanswered && (
              <Tag icon={<ExclamationCircleOutlined />} color="red" className="text-xs">
                {t('admin:kai.sessions.notAnswered')}
              </Tag>
            )}
          </div>
          {s.email && s.name && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{s.email}</p>
          )}
          {preview && (
            <p className="text-xs text-slate-500 mt-1 truncate italic">"{preview}"</p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="text-xs text-slate-400">
            {dayjs(s.updated_at).fromNow()}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <MessageOutlined /> {s.message_count}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const { t } = useTranslation(['admin']);
  // Support both {role, content} and n8n LangChain format {type, content}
  const role = msg.role || (msg.type === 'ai' ? 'assistant' : msg.type === 'human' ? 'user' : msg.type);
  const content = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((p) => p?.text || p?.content || '').join('')
      : String(msg.content ?? '');

  const isAssistant = role === 'assistant';
  const flagged = isAssistant && isUnanswered(content);

  if (!content) return null;

  return (
    <div className={`flex gap-2 mb-3 ${isAssistant ? 'flex-row' : 'flex-row-reverse'}`}>
      <Avatar
        size={28}
        icon={isAssistant ? <RobotOutlined /> : <UserOutlined />}
        className={isAssistant ? 'bg-sky-500 shrink-0' : 'bg-slate-400 shrink-0'}
      />
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
          ${isAssistant
            ? flagged
              ? 'bg-red-50 border border-red-200 text-slate-800'
              : 'bg-slate-100 text-slate-800'
            : 'bg-sky-500 text-white'
          }`}
      >
        {flagged && (
          <p className="text-xs font-semibold text-red-500 mb-1 flex items-center gap-1">
            <ExclamationCircleOutlined /> {t('admin:kai.sessions.couldntAnswer')}
          </p>
        )}
        {content}
      </div>
    </div>
  );
}

// ── Session detail drawer ─────────────────────────────────────────────────────

function SessionDrawer({ sessionId, onClose }) {
  const { t } = useTranslation(['admin']);
  const { data: session, isLoading, error } = useQuery({
    queryKey: ['kai-session', sessionId],
    queryFn: () => fetchSession(sessionId),
    enabled: !!sessionId,
    retry: 1,
  });

  const messages = Array.isArray(session?.messages) ? session.messages : [];

  return (
    <Drawer
      open={!!sessionId}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <RobotOutlined className="text-sky-500" />
          <span className="text-sm font-semibold">
            {session?.name || session?.email || t('admin:kai.drawer.conversation')}
          </span>
          {session?.user_role && (
            <Tag color={roleColor[session.user_role] || 'default'} className="text-xs">
              {session.user_role}
            </Tag>
          )}
        </div>
      }
      width={520}
      styles={{ body: { padding: '16px', overflowY: 'auto' } }}
    >
      {isLoading && (
        <div className="flex justify-center py-12"><Spin /></div>
      )}
      {error && !isLoading && (
        <div className="py-8 text-center text-red-500 text-sm">
          {t('admin:kai.drawer.loadError')}
        </div>
      )}
      {!isLoading && !error && session && (
        <>
          {session.summary && (
            <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm text-slate-700">
              <p className="text-xs font-semibold text-sky-600 mb-1">{t('admin:kai.drawer.summary')}</p>
              {session.summary}
            </div>
          )}
          {messages.length === 0 ? (
            <Empty description={t('admin:kai.drawer.noMessages')} />
          ) : (
            messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)
          )}
        </>
      )}
    </Drawer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KaiSessionsPage() {
  const { t } = useTranslation(['admin']);
  const [search, setSearch]               = useState('');
  const [role, setRole]                   = useState(null);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [offset, setOffset]               = useState(0);
  const [activeSession, setActiveSession] = useState(null);
  const LIMIT = 50;

  const queryParams = {
    limit: LIMIT,
    offset,
    ...(search && { search }),
    ...(role   && { role }),
    ...(unansweredOnly && { unansweredOnly: 'true' }),
  };

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['kai-sessions', queryParams],
    queryFn: () => fetchSessions(queryParams),
    refetchInterval: 30_000,
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['kai-stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  });

  const handleRefreshAll = useCallback(() => {
    refetch();
    refetchStats();
  }, [refetch, refetchStats]);

  const handleSearch = useCallback((val) => {
    setSearch(val);
    setOffset(0);
  }, []);

  const handleRole = useCallback((val) => {
    setRole(val || null);
    setOffset(0);
  }, []);

  const handleUnanswered = useCallback((checked) => {
    setUnansweredOnly(checked);
    setOffset(0);
  }, []);

  const sessions = data?.sessions || [];
  const total    = data?.total    || 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <RobotOutlined className="text-2xl text-sky-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">{t('admin:kai.title')}</h1>
            <p className="text-sm text-slate-500">
              {dataUpdatedAt
                ? t('admin:kai.subtitleWithTime', { time: dayjs(dataUpdatedAt).format('HH:mm:ss') })
                : t('admin:kai.subtitle')}
            </p>
          </div>
        </div>
        <Tooltip title={t('admin:kai.refreshNow')}>
          <Button icon={<ReloadOutlined />} onClick={handleRefreshAll} />
        </Tooltip>
      </div>

      <StatsBar stats={stats} loading={statsLoading} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Search
          placeholder={t('admin:kai.filters.searchPlaceholder')}
          allowClear
          onSearch={handleSearch}
          onChange={(e) => !e.target.value && handleSearch('')}
          className="w-64"
          prefix={<SearchOutlined className="text-slate-400" />}
        />
        <Select
          placeholder={t('admin:kai.filters.allRoles')}
          allowClear
          onChange={handleRole}
          className="w-40"
          options={[
            { value: 'outsider',   label: t('admin:kai.filters.roles.outsider')  },
            { value: 'student',    label: t('admin:kai.filters.roles.student')   },
            { value: 'instructor', label: t('admin:kai.filters.roles.instructor') },
            { value: 'manager',    label: t('admin:kai.filters.roles.manager')   },
            { value: 'admin',      label: t('admin:kai.filters.roles.admin')     },
          ]}
        />
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1">
          <Switch
            size="small"
            checked={unansweredOnly}
            onChange={handleUnanswered}
          />
          <span className="text-sm text-slate-600">{t('admin:kai.filters.unansweredOnly')}</span>
        </div>
      </div>

      {/* Session list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : sessions.length === 0 ? (
        <Empty description={t('admin:kai.sessions.noSessions')} />
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-3">{t('admin:kai.sessions.found', { count: total })}</p>
          {sessions.map((s) => (
            <SessionRow key={s.session_id} s={s} onOpen={setActiveSession} />
          ))}
          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <Button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              {t('admin:kai.sessions.previous')}
            </Button>
            <span className="text-sm text-slate-500">
              {t('admin:kai.sessions.pageRange', { from: offset + 1, to: Math.min(offset + LIMIT, total), total })}
            </span>
            <Button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              {t('admin:kai.sessions.next')}
            </Button>
          </div>
        </>
      )}

      <SessionDrawer
        sessionId={activeSession}
        onClose={() => setActiveSession(null)}
      />
    </div>
  );
}
