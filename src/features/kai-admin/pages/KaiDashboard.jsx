import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKaiStats, useKaiConversations } from '../hooks/useKaiAdmin';

const StatCard = ({ label, value, sub }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <p className="text-sm text-gray-500 mb-1">{label}</p>
    <p className="text-2xl font-semibold text-gray-900">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const RoleBadge = ({ role }) => {
  const colors = {
    student: 'bg-blue-50 text-blue-700',
    admin: 'bg-purple-50 text-purple-700',
    manager: 'bg-indigo-50 text-indigo-700',
    instructor: 'bg-green-50 text-green-700',
    outsider: 'bg-gray-50 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${colors[role] || colors.outsider}`}>
      {role || 'guest'}
    </span>
  );
};

export default function KaiDashboard() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: stats, isLoading: statsLoading } = useKaiStats();
  const { data: convData, isLoading: convLoading } = useKaiConversations({
    page,
    limit: 20,
    userRole: roleFilter || undefined,
    search: search || undefined,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Kai Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor AI assistant conversations and performance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Conversations" value={stats?.totalConversations ?? '—'} />
        <StatCard label="Today" value={stats?.today ?? '—'} />
        <StatCard label="This Week" value={stats?.thisWeek ?? '—'} />
        <StatCard
          label="Avg Messages"
          value={stats?.avgMessagesPerConversation ?? '—'}
          sub="per conversation (30d)"
        />
      </div>

      {/* Role breakdown */}
      {stats?.byRole && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {stats.byRole.map((r) => (
            <div
              key={r.role}
              onClick={() => setRoleFilter(roleFilter === r.role ? '' : r.role)}
              className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer border transition-colors ${
                roleFilter === r.role
                  ? 'bg-duotone-blue text-white border-duotone-blue'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {r.role || 'guest'}: {r.count}
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-md px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-duotone-blue/40 focus:ring-1 focus:ring-duotone-blue/20"
        />
      </div>

      {/* Conversation list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-center">Messages</th>
              <th className="px-4 py-3 text-center">Flags</th>
              <th className="px-4 py-3">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {convLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : convData?.conversations?.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No conversations found</td></tr>
            ) : (
              convData?.conversations?.map((c) => (
                <tr
                  key={c.sessionId}
                  onClick={() => navigate(`/admin/kai/${c.sessionId}`)}
                  className="border-b border-gray-50 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{c.userName}</td>
                  <td className="px-4 py-3"><RoleBadge role={c.userRole} /></td>
                  <td className="px-4 py-3 text-center text-gray-600">{c.messageCount}</td>
                  <td className="px-4 py-3 text-center">
                    {c.flagCount > 0 ? (
                      <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-md text-xs font-medium">{c.flagCount}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {convData?.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {convData.total} conversations
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                disabled={page * 20 >= convData.total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
