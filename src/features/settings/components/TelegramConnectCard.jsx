import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Switch, Spin } from 'antd';
import {
  BellOutlined,
  MailOutlined,
  CheckCircleFilled,
  DisconnectOutlined,
  CopyOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';
import { logger } from '@/shared/utils/logger';

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
};

/**
 * Reusable Telegram connect card. Self-contained: fetches link status,
 * fetches/updates the telegram_notifications preference, and triggers the
 * deep-link flow. Renders a single column suitable for any settings page.
 */
export default function TelegramConnectCard() {
  const { t } = useTranslation(['instructor']);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [telegramPref, setTelegramPref] = useState(true);
  const [savingPref, setSavingPref] = useState(false);
  const [pendingCode, setPendingCode] = useState(null);
  const [pendingDeepLink, setPendingDeepLink] = useState(null);
  const [pendingExpiresAt, setPendingExpiresAt] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: statusData }, prefsResp] = await Promise.all([
        apiClient.get('/telegram/status'),
        apiClient.get('/notifications/settings').catch(() => ({ data: null }))
      ]);
      setStatus(statusData);
      const prefs = prefsResp?.data;
      if (prefs && typeof prefs.telegram_notifications === 'boolean') {
        setTelegramPref(prefs.telegram_notifications);
      }
    } catch (err) {
      logger.warn('Failed to load Telegram status', { error: String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.post('/telegram/link-code');
      if (data?.deepLinkUrl) {
        setPendingCode(data.code);
        setPendingDeepLink(data.deepLinkUrl);
        setPendingExpiresAt(data.expiresAt);
        window.open(data.deepLinkUrl, '_blank', 'noopener,noreferrer');
        // Poll status briefly so the UI flips to "linked" without a refresh.
        const start = Date.now();
        const tick = async () => {
          if (Date.now() - start > 5 * 60 * 1000) return;
          try {
            const { data: s } = await apiClient.get('/telegram/status');
            if (s?.linked) {
              setStatus(s);
              setPendingCode(null);
              setPendingDeepLink(null);
              setPendingExpiresAt(null);
              message.success(t('instructor:telegram.unlinked').replace(/disconnected\.?$/i, '').trim() || 'Linked!');
              return;
            }
          } catch { /* ignore */ }
          setTimeout(tick, 3000);
        };
        setTimeout(tick, 3000);
      } else {
        message.error(t('instructor:telegram.disabled'));
      }
    } catch (err) {
      logger.error('Failed to generate Telegram link code', { error: String(err) });
      message.error(t('instructor:telegram.connectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!pendingCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${pendingCode}`);
      message.success(t('instructor:telegram.codeCopied'));
    } catch {
      message.error(t('instructor:telegram.copyFailed'));
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    try {
      await apiClient.post('/telegram/unlink');
      message.success(t('instructor:telegram.unlinked'));
      await loadStatus();
    } catch (err) {
      logger.error('Failed to unlink Telegram', { error: String(err) });
      message.error(t('instructor:telegram.unlinkFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePref = async (next) => {
    setSavingPref(true);
    try {
      await apiClient.put('/notifications/settings', { telegram_notifications: next });
      setTelegramPref(next);
    } catch (err) {
      logger.error('Failed to update Telegram preference', { error: String(err) });
      message.error(t('instructor:telegram.prefSaveFailed'));
    } finally {
      setSavingPref(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Spin /></div>;
  }

  const linked = !!status?.linked;
  const botConfigured = !!status?.botUsername;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
            <BellOutlined className="text-sky-600 dark:text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('instructor:telegram.title')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('instructor:telegram.description')}
            </div>
          </div>
        </div>

        {!botConfigured && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 mb-3">
            {t('instructor:telegram.disabled')}
          </div>
        )}

        {linked ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircleFilled className="text-emerald-500 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200 truncate">
                  {status.username
                    ? t('instructor:telegram.linkedAs', { username: status.username })
                    : t('instructor:telegram.linkedNoUsername')}
                </div>
                {status.linkedAt && (
                  <div className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                    {t('instructor:telegram.linkedOn', { date: formatDate(status.linkedAt) })}
                  </div>
                )}
              </div>
            </div>
            <Button
              size="small"
              icon={<DisconnectOutlined />}
              loading={busy}
              onClick={handleUnlink}
            >
              {t('instructor:telegram.unlink')}
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="primary"
              icon={<MailOutlined />}
              loading={busy}
              disabled={!botConfigured}
              onClick={handleConnect}
              className="w-full sm:w-auto"
            >
              {t('instructor:telegram.connect')}
            </Button>

            {pendingCode && (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/20 p-3 space-y-2">
                <div className="text-xs font-medium text-sky-800 dark:text-sky-200">
                  {t('instructor:telegram.fallbackTitle')}
                </div>
                <div className="text-xs text-sky-700 dark:text-sky-300">
                  {t('instructor:telegram.fallbackHint')}
                </div>
                <div className="flex items-center gap-2 rounded bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-700 px-2 py-1.5">
                  <code className="flex-1 text-xs font-mono text-slate-800 dark:text-slate-200 break-all">
                    /link {pendingCode}
                  </code>
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={handleCopyCode}
                  >
                    {t('instructor:telegram.copy')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="small"
                    onClick={() => window.open(pendingDeepLink, '_blank', 'noopener,noreferrer')}
                  >
                    {t('instructor:telegram.reopenTelegram')}
                  </Button>
                </div>
                {pendingExpiresAt && (
                  <div className="text-[11px] text-sky-700/70 dark:text-sky-400/70">
                    {t('instructor:telegram.codeExpires', { time: new Date(pendingExpiresAt).toLocaleTimeString() })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {linked && (
        <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {t('instructor:telegram.notificationsToggle')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('instructor:telegram.notificationsToggleHint')}
              </div>
            </div>
            <Switch
              checked={telegramPref}
              loading={savingPref}
              onChange={handleTogglePref}
            />
          </div>
        </div>
      )}
    </div>
  );
}
