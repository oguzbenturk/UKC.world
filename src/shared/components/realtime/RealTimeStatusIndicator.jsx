// Minimal Real Time Status Indicator (now polls backend stats)
import { useState, useEffect, useRef } from 'react';
import apiClient from '@/shared/services/apiClient';

const RealTimeStatusIndicator = () => {
  const [isConnected, setIsConnected] = useState(true);
  const [activeUsers, setActiveUsers] = useState(1);
  const timerRef = useRef(null);

  const fetchStats = async () => {
    try {
      const { data } = await apiClient.get('/socket/stats');
      const total = data?.stats?.totalConnections ?? data?.stats?.connectedUsers ?? 0;
      setActiveUsers(Number(total) || 0);
      setIsConnected(true);
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

  return (
    <div className="flex items-center space-x-2 text-sm">
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
    </div>
  );
};

export default RealTimeStatusIndicator;
