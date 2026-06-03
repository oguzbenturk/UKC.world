import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Spin,
  Slider,
  Alert,
  TimePicker,
  Select,
  Popconfirm,
  Avatar,
  Tag,
  Empty
} from 'antd';
import dayjs from 'dayjs';
import {
  CustomerServiceOutlined,
  PlayCircleFilled,
  PauseCircleFilled,
  StepForwardOutlined,
  StepBackwardOutlined,
  SoundOutlined,
  DisconnectOutlined,
  DesktopOutlined,
  MobileOutlined,
  LaptopOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';
import { logger } from '@/shared/utils/logger';

const SPOTIFY_GREEN = '#1DB954';

const REPEAT_MODES = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekends', label: 'Weekends (Sat-Sun)' }
];

const SCHEDULE_TRIGGER_KEY = 'spotify_schedule_last_triggers';

const formatMs = (ms) => {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const deviceIcon = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('smartphone') || t.includes('phone')) return <MobileOutlined />;
  if (t.includes('computer') || t.includes('laptop')) return <LaptopOutlined />;
  return <DesktopOutlined />;
};

const readTriggerMap = () => {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULE_TRIGGER_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeTriggerMap = (map) => {
  try {
    localStorage.setItem(SCHEDULE_TRIGGER_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const shouldRunSchedule = (schedule) => {
  const now = new Date();
  const [h, m] = (schedule.scheduled_time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  const diffSec = Math.abs((now - target) / 1000);
  if (diffSec > 30) return false;

  const day = now.getDay();
  if (schedule.repeat_mode === 'weekdays' && (day === 0 || day === 6)) return false;
  if (schedule.repeat_mode === 'weekends' && day !== 0 && day !== 6) return false;
  return true;
};

export default function MusicSettings() {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connectBusy, setConnectBusy] = useState(false);

  const [nowPlaying, setNowPlaying] = useState(null);
  const [nowLoading, setNowLoading] = useState(false);
  const [volume, setVolume] = useState(50);
  const [seekValue, setSeekValue] = useState(null);

  const [devices, setDevices] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    time: null,
    playlist_uri: null,
    device_id: null,
    repeat_mode: 'once'
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const connected = status?.connected;
  const configured = status?.configured;

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const { data } = await apiClient.get('/spotify/status');
      setStatus(data);
    } catch (err) {
      logger.warn('Spotify status load failed', { error: String(err) });
      setStatus({ configured: false, connected: false });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadNowPlaying = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/spotify/now-playing');
      setNowPlaying(data);
      if (data?.device?.volume_percent != null) {
        setVolume(data.device.volume_percent);
      }
    } catch (err) {
      if (err?.response?.status !== 401) {
        logger.warn('Now playing fetch failed', { error: String(err) });
      }
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/spotify/devices');
      setDevices(data?.devices || []);
    } catch (err) {
      logger.warn('Devices load failed', { error: String(err) });
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    try {
      const { data } = await apiClient.get('/spotify/playlists');
      setPlaylists(data?.items || []);
    } catch (err) {
      logger.warn('Playlists load failed', { error: String(err) });
    } finally {
      setPlaylistsLoading(false);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/spotify/schedules');
      setSchedules(data?.schedules || []);
    } catch (err) {
      logger.warn('Schedules load failed', { error: String(err) });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!connected) return;
    setNowLoading(true);
    Promise.all([loadNowPlaying(), loadDevices(), loadPlaylists(), loadSchedules()]).finally(() =>
      setNowLoading(false)
    );
  }, [connected, loadNowPlaying, loadDevices, loadPlaylists, loadSchedules]);

  // Now-playing poll — 5s while the screen is actively visible, backing off to 30s
  // when the tab/screen is hidden, so an always-on display doesn't hammer Spotify's
  // API (and risk rate limits) around the clock.
  useEffect(() => {
    if (!connected) return undefined;
    let intervalId = null;
    const start = () => {
      if (intervalId) clearInterval(intervalId);
      const hidden = typeof document !== 'undefined' && document.hidden;
      intervalId = setInterval(loadNowPlaying, hidden ? 30000 : 5000);
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) loadNowPlaying();
      start(); // reset the cadence for the new visibility state
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [connected, loadNowPlaying]);

  // Listen for OAuth completion from popup
  useEffect(() => {
    const onMessage = (event) => {
      if (event?.data?.type === 'spotify:connected') {
        message.success('Spotify connected.');
        loadStatus();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadStatus]);

  // Schedule runner — checks every 30s
  const triggerSchedule = useCallback(
    async (schedule) => {
      try {
        await apiClient.post('/spotify/play-playlist', {
          playlist_uri: schedule.playlist_uri,
          device_id: schedule.device_id || undefined
        });
        await apiClient.post(`/spotify/schedule/${schedule.id}/triggered`);
        const map = readTriggerMap();
        map[schedule.id] = todayKey();
        writeTriggerMap(map);
        message.success(`Playing scheduled playlist: ${schedule.playlist_name || 'Spotify'}`);
      } catch (err) {
        logger.error('Scheduled playback failed', { error: String(err) });
      }
    },
    []
  );

  useEffect(() => {
    if (!connected || schedules.length === 0) return undefined;
    const tick = () => {
      const map = readTriggerMap();
      const today = todayKey();
      for (const sched of schedules) {
        if (!sched.is_active) continue;
        if (map[sched.id] === today) continue;
        if (shouldRunSchedule(sched)) {
          triggerSchedule(sched);
        }
      }
    };
    tick();
    const id = setInterval(tick, 30 * 1000);
    return () => clearInterval(id);
  }, [connected, schedules, triggerSchedule]);

  // Seek slider local state — only push to API on release
  useEffect(() => {
    if (seekValue !== null) return;
    if (!nowPlaying?.progress_ms) return;
    // Keep React state in sync with playback progress
  }, [nowPlaying?.progress_ms, seekValue]);

  const handleConnect = async () => {
    setConnectBusy(true);

    const ua = navigator.userAgent || '';
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      // iPadOS 13+ reports a Mac UA — detect via touch points
      (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);

    // Open the popup synchronously (with about:blank) so the browser treats it
    // as a user-gesture popup and doesn't block it. We then redirect it after
    // the auth URL fetch resolves. On mobile, popups are unreliable
    // (window.opener is often null, postMessage doesn't propagate), so we do a
    // full-page redirect instead — SpotifyCallback handles that case.
    const popup = isMobile
      ? null
      : window.open('about:blank', 'spotify-oauth', 'width=500,height=720');

    try {
      const { data } = await apiClient.get('/spotify/auth-url');
      if (!data?.url) {
        if (popup && !popup.closed) popup.close();
        return;
      }
      if (popup && !popup.closed) {
        popup.location.href = data.url;
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      logger.error('Failed to start Spotify OAuth', { error: String(err) });
      message.error('Could not start Spotify connection.');
    } finally {
      setConnectBusy(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await apiClient.post('/spotify/disconnect');
      setStatus({ configured, connected: false });
      setNowPlaying(null);
      setDevices([]);
      setPlaylists([]);
      message.success('Spotify disconnected.');
    } catch (err) {
      message.error('Failed to disconnect.');
    }
  };

  const handlePlayPause = async () => {
    try {
      if (nowPlaying?.is_playing) {
        await apiClient.post('/spotify/pause');
      } else {
        await apiClient.post('/spotify/play');
      }
      loadNowPlaying();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Playback control failed.');
    }
  };

  const handleNext = async () => {
    try {
      await apiClient.post('/spotify/next');
      setTimeout(loadNowPlaying, 400);
    } catch (err) {
      message.error('Failed to skip track.');
    }
  };

  const handlePrev = async () => {
    try {
      await apiClient.post('/spotify/previous');
      setTimeout(loadNowPlaying, 400);
    } catch (err) {
      message.error('Failed to go back.');
    }
  };

  const handleVolumeChange = async (val) => {
    setVolume(val);
    try {
      await apiClient.post('/spotify/volume', { volume: val });
    } catch (err) {
      logger.warn('Volume update failed', { error: String(err) });
    }
  };

  const handleSeekCommit = async (val) => {
    setSeekValue(null);
    try {
      await apiClient.post('/spotify/seek', { position_ms: val });
      setTimeout(loadNowPlaying, 300);
    } catch (err) {
      message.error('Seek failed.');
    }
  };

  const handleTransferDevice = async (device) => {
    try {
      await apiClient.post('/spotify/transfer', {
        device_id: device.id,
        play: nowPlaying?.is_playing
      });
      message.success(`Switched playback to ${device.name}`);
      setTimeout(() => {
        loadDevices();
        loadNowPlaying();
      }, 600);
    } catch (err) {
      message.error('Could not transfer playback.');
    }
  };

  const handlePlayPlaylist = async (playlist) => {
    try {
      await apiClient.post('/spotify/play-playlist', {
        playlist_uri: playlist.uri
      });
      message.success(`Playing: ${playlist.name}`);
      setTimeout(loadNowPlaying, 600);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not start playlist.');
    }
  };

  const handleAddSchedule = async () => {
    const { time, playlist_uri, device_id, repeat_mode } = scheduleForm;
    if (!time || !playlist_uri) {
      message.warning('Pick a time and a playlist first.');
      return;
    }
    setScheduleBusy(true);
    try {
      const playlist = playlists.find((p) => p.uri === playlist_uri);
      const device = devices.find((d) => d.id === device_id);
      await apiClient.post('/spotify/schedule', {
        playlist_uri,
        playlist_name: playlist?.name || null,
        device_id: device_id || null,
        device_name: device?.name || null,
        scheduled_time: time.format('HH:mm'),
        repeat_mode
      });
      setScheduleForm({ time: null, playlist_uri: null, device_id: null, repeat_mode: 'once' });
      await loadSchedules();
      message.success('Schedule added.');
    } catch (err) {
      message.error('Failed to add schedule.');
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleDeleteSchedule = async (id) => {
    try {
      await apiClient.delete(`/spotify/schedule/${id}`);
      await loadSchedules();
    } catch (err) {
      message.error('Failed to delete schedule.');
    }
  };

  const track = nowPlaying?.item;
  const progressMs = seekValue !== null ? seekValue : nowPlaying?.progress_ms || 0;
  const durationMs = track?.duration_ms || 0;
  const albumArt = track?.album?.images?.[0]?.url;
  const artistNames = useMemo(
    () => (track?.artists || []).map((a) => a.name).join(', '),
    [track?.artists]
  );

  if (statusLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!configured && (
        <Alert
          type="warning"
          showIcon
          message="Spotify is not configured on the server"
          description="Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI in backend/.env and restart the API."
          className="rounded-lg"
        />
      )}

      <Card
        title={
          <span className="flex items-center gap-2">
            <CustomerServiceOutlined style={{ color: SPOTIFY_GREEN }} />
            Spotify connection
          </span>
        }
        className="rounded-xl shadow-sm"
      >
        {connected ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar size={48} src={status?.profile?.avatarUrl} style={{ background: SPOTIFY_GREEN }}>
                {(status?.profile?.displayName || '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <div className="text-base font-semibold text-slate-800">
                  {status?.profile?.displayName || 'Spotify user'}
                </div>
                <div className="text-xs text-slate-500">
                  {status?.profile?.email}
                  {status?.profile?.product && (
                    <Tag color={status.profile.product === 'premium' ? 'green' : 'default'} className="ml-2">
                      {status.profile.product}
                    </Tag>
                  )}
                </div>
              </div>
            </div>
            <Popconfirm
              title="Disconnect Spotify?"
              okText="Disconnect"
              cancelText="Cancel"
              onConfirm={handleDisconnect}
            >
              <Button icon={<DisconnectOutlined />}>Disconnect</Button>
            </Popconfirm>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <div className="text-sm text-slate-600">
              Connect a Spotify Premium account to control playback, browse playlists, and schedule background music for the studio.
            </div>
            <Button
              type="primary"
              size="large"
              loading={connectBusy}
              disabled={!configured}
              onClick={handleConnect}
              icon={<CustomerServiceOutlined />}
              style={{ background: SPOTIFY_GREEN, borderColor: SPOTIFY_GREEN }}
            >
              Connect with Spotify Premium
            </Button>
          </div>
        )}
      </Card>

      {connected && (
        <>
          {/* Now Playing */}
          <Card
            title={<span className="flex items-center gap-2"><PlayCircleFilled style={{ color: SPOTIFY_GREEN }} />Now playing</span>}
            extra={
              <Button size="small" icon={<ReloadOutlined />} onClick={loadNowPlaying} loading={nowLoading}>
                Refresh
              </Button>
            }
            className="rounded-xl shadow-sm"
          >
            {!track ? (
              <Empty
                description="Nothing playing. Start something on Spotify or pick a playlist below."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <div className="flex flex-col sm:flex-row gap-4">
                {albumArt ? (
                  <img
                    src={albumArt}
                    alt={track.album?.name}
                    className="w-16 h-16 rounded-lg object-cover shadow"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center">
                    <CustomerServiceOutlined className="text-2xl text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <div className="text-base font-semibold text-slate-800 truncate">{track.name}</div>
                    <div className="text-sm text-slate-500 truncate">
                      {artistNames} {track.album?.name ? `· ${track.album.name}` : ''}
                    </div>
                  </div>
                  <div>
                    <Slider
                      min={0}
                      max={durationMs}
                      value={progressMs}
                      onChange={(v) => setSeekValue(v)}
                      onChangeComplete={handleSeekCommit}
                      tooltip={{ formatter: formatMs }}
                    />
                    <div className="flex justify-between text-xs text-slate-500 -mt-2">
                      <span>{formatMs(progressMs)}</span>
                      <span>{formatMs(durationMs)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button shape="circle" icon={<StepBackwardOutlined />} onClick={handlePrev} />
                    <Button
                      type="primary"
                      shape="circle"
                      size="large"
                      icon={nowPlaying?.is_playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
                      onClick={handlePlayPause}
                      style={{ background: SPOTIFY_GREEN, borderColor: SPOTIFY_GREEN }}
                    />
                    <Button shape="circle" icon={<StepForwardOutlined />} onClick={handleNext} />
                    <div className="flex-1 min-w-[160px] flex items-center gap-2 ml-2">
                      <SoundOutlined className="text-slate-500" />
                      <Slider
                        min={0}
                        max={100}
                        value={volume}
                        onChange={setVolume}
                        onChangeComplete={handleVolumeChange}
                        className="flex-1"
                      />
                      <span className="text-xs text-slate-500 w-8 text-right">{volume}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Devices */}
          <Card
            title={<span className="flex items-center gap-2"><DesktopOutlined className="text-sky-500" />Available devices</span>}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadDevices}>Refresh</Button>}
            className="rounded-xl shadow-sm"
          >
            {devices.length === 0 ? (
              <Empty
                description="No active Spotify devices found. Open Spotify on a phone, browser, or speaker."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <div className="space-y-2">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleTransferDevice(d)}
                    className={`w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                      d.is_active
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xl ${d.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {deviceIcon(d.type)}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{d.name}</div>
                        <div className="text-xs text-slate-500">
                          {d.type} {d.volume_percent != null ? `· ${d.volume_percent}%` : ''}
                        </div>
                      </div>
                    </div>
                    {d.is_active && <Tag color="green">Active</Tag>}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Playlists */}
          <Card
            title={<span className="flex items-center gap-2"><CustomerServiceOutlined style={{ color: SPOTIFY_GREEN }} />Your playlists</span>}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadPlaylists} loading={playlistsLoading}>Refresh</Button>}
            className="rounded-xl shadow-sm"
          >
            {playlistsLoading ? (
              <div className="flex justify-center py-8"><Spin /></div>
            ) : playlists.length === 0 ? (
              <Empty description="No playlists yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {playlists.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                  >
                    {p.images?.[0]?.url ? (
                      <img src={p.images[0].url} alt={p.name} className="w-12 h-12 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center">
                        <CustomerServiceOutlined className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.tracks?.total ?? 0} tracks</div>
                    </div>
                    <Button
                      size="small"
                      type="primary"
                      shape="circle"
                      icon={<PlayCircleFilled />}
                      onClick={() => handlePlayPlaylist(p)}
                      style={{ background: SPOTIFY_GREEN, borderColor: SPOTIFY_GREEN }}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Scheduler */}
          <Card
            title={<span className="flex items-center gap-2"><ClockCircleOutlined className="text-sky-500" />Scheduled playback</span>}
            className="rounded-xl shadow-sm"
          >
            <Alert
              type="info"
              showIcon
              className="rounded-lg mb-4"
              message="Schedules run while Plannivo is open in this browser tab."
            />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
              <div className="md:col-span-2">
                <TimePicker
                  value={scheduleForm.time}
                  onChange={(t) => setScheduleForm((prev) => ({ ...prev, time: t }))}
                  format="HH:mm"
                  minuteStep={5}
                  placeholder="Time"
                  className="w-full"
                />
              </div>
              <div className="md:col-span-4">
                <Select
                  className="w-full"
                  placeholder="Playlist"
                  value={scheduleForm.playlist_uri}
                  onChange={(v) => setScheduleForm((prev) => ({ ...prev, playlist_uri: v }))}
                  options={playlists.map((p) => ({ value: p.uri, label: p.name }))}
                  showSearch
                  optionFilterProp="label"
                />
              </div>
              <div className="md:col-span-3">
                <Select
                  className="w-full"
                  placeholder="Device (optional)"
                  value={scheduleForm.device_id}
                  onChange={(v) => setScheduleForm((prev) => ({ ...prev, device_id: v }))}
                  allowClear
                  options={devices.map((d) => ({ value: d.id, label: d.name }))}
                />
              </div>
              <div className="md:col-span-2">
                <Select
                  className="w-full"
                  value={scheduleForm.repeat_mode}
                  onChange={(v) => setScheduleForm((prev) => ({ ...prev, repeat_mode: v }))}
                  options={REPEAT_MODES}
                />
              </div>
              <div className="md:col-span-1">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={scheduleBusy}
                  onClick={handleAddSchedule}
                  className="w-full"
                  style={{ background: SPOTIFY_GREEN, borderColor: SPOTIFY_GREEN }}
                >
                  Add
                </Button>
              </div>
            </div>

            {schedules.length === 0 ? (
              <Empty description="No schedules yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div className="space-y-2">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-lg font-semibold text-slate-800 font-mono">
                        {s.scheduled_time}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {s.playlist_name || s.playlist_uri}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {REPEAT_MODES.find((r) => r.value === s.repeat_mode)?.label || s.repeat_mode}
                          {s.device_name ? ` · ${s.device_name}` : ''}
                          {s.last_triggered_at ? ` · last ${dayjs(s.last_triggered_at).format('MMM D HH:mm')}` : ''}
                        </div>
                      </div>
                    </div>
                    <Popconfirm
                      title="Delete this schedule?"
                      okText="Delete"
                      cancelText="Cancel"
                      onConfirm={() => handleDeleteSchedule(s.id)}
                    >
                      <Button danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
