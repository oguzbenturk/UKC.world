// Minimal Real Time Status Indicator (now polls backend stats)
import { useState, useEffect, useRef } from 'react';
import { Popover } from 'antd';
import apiClient from '@/shared/services/apiClient';

const RealTimeStatusIndicator = () => {
  const [isConnected, setIsConnected] = useState(true);
  const [activeUsers, setActiveUsers] = useState(1);
  const [connectedUserList, setConnectedUserList] = useState([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const timerRef = useRef(null);

  const fetchStats = async () => {
    try {
      const { data } = await apiClient.get('/socket/stats');
      const total = data?.stats?.totalConnections ?? data?.stats?.connectedUsers ?? 0;
      setActiveUsers(Number(total) || 0);
      setIsConnected(true);
      if (data?.stats?.users && Array.isArray(data.stats.users)) {
        setConnectedUserList(data.stats.users);
      }
    } catch {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    // initial fetch
    fetchStats();
    // poll every 20s
    timerRef.current = setInterval(fetchStats, 20000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    fetchStats();
    setPopoverOpen(!popoverOpen);
  };

  const popoverContent = (
    <div style={{ maxHeight: 300, overflowY: 'auto', minWidth: 200 }}>
      <div className="text-xs font-semibold text-slate-500 mb-2">
        {activeUsers} user{activeUsers !== 1 ? 's' : ''} online
      </div>
      {connectedUserList.length > 0 ? (
        <ul className="space-y-1.5 list-none p-0 m-0">
          {connectedUserList.map((u, i) => (
            <li key={u.id || i} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-200 truncate">
                {u.name || u.email || `User ${i + 1}`}
              </span>
              {u.role && (
                <span className="text-xs text-slate-400 ml-auto">{u.role}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 m-0">
          {isConnected ? 'Active user details not available' : 'Connection lost'}
        </p>
      )}
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      title="Active Users"
      trigger="click"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      placement="bottomRight"
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center space-x-2 text-sm cursor-pointer bg-transparent border-none p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center space-x-1.5">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="font-semibold text-slate-600 dark:text-slate-200">{isConnected ? 'Live' : 'Offline'}</span>
          <span
            className="text-slate-500 text-xs"
            title={`${activeUsers} ${isConnected ? 'online' : 'offline'}`}
          >
            {activeUsers}
          </span>
        </div>
      </button>
    </Popover>
  );
};

export default RealTimeStatusIndicator;
