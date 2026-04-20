/**
 * Antd Static API Holder
 *
 * This module provides static access to antd's message, notification, and modal APIs
 * while properly consuming context (theme, locale, etc.)
 *
 * Usage:
 *   import { message, notification, modal } from '@/shared/utils/antdStatic';
 *   message.success('It works!');
 *
 * i18n-aware wrappers (preferred for new code):
 *   import { tMessage, tNotification, tModal } from '@/shared/utils/antdStatic';
 *   tMessage.success('bookings:created');
 *   tMessage.error('errors:AUTH_INVALID_CREDENTIALS', { email });
 */

import i18n from '@/i18n';

let messageApi = null;
let notificationApi = null;
let modalApi = null;

export const setAntdStaticApis = (apis) => {
  messageApi = apis.message;
  notificationApi = apis.notification;
  modalApi = apis.modal;
};

export const message = {
  success: (...args) => messageApi?.success(...args),
  error: (...args) => messageApi?.error(...args),
  info: (...args) => messageApi?.info(...args),
  warning: (...args) => messageApi?.warning(...args),
  loading: (...args) => messageApi?.loading(...args),
  open: (...args) => messageApi?.open(...args),
  destroy: (...args) => messageApi?.destroy(...args),
};

export const notification = {
  success: (...args) => notificationApi?.success(...args),
  error: (...args) => notificationApi?.error(...args),
  info: (...args) => notificationApi?.info(...args),
  warning: (...args) => notificationApi?.warning(...args),
  open: (...args) => notificationApi?.open(...args),
  destroy: (...args) => notificationApi?.destroy(...args),
};

export const modal = {
  info: (...args) => modalApi?.info(...args),
  success: (...args) => modalApi?.success(...args),
  error: (...args) => modalApi?.error(...args),
  warning: (...args) => modalApi?.warning(...args),
  confirm: (...args) => modalApi?.confirm(...args),
  destroyAll: (...args) => modalApi?.destroyAll(...args),
};

const translateFirstArg = (fn) => (key, vars, ...rest) => {
  if (typeof key === 'string') return fn(i18n.t(key, vars), ...rest);
  return fn(key, vars, ...rest);
};

export const tMessage = {
  success: translateFirstArg((...a) => messageApi?.success(...a)),
  error: translateFirstArg((...a) => messageApi?.error(...a)),
  info: translateFirstArg((...a) => messageApi?.info(...a)),
  warning: translateFirstArg((...a) => messageApi?.warning(...a)),
  loading: translateFirstArg((...a) => messageApi?.loading(...a)),
};

export const tNotification = {
  success: (config = {}) => notificationApi?.success({
    ...config,
    message: typeof config.message === 'string' ? i18n.t(config.message, config.messageVars) : config.message,
    description: typeof config.description === 'string' ? i18n.t(config.description, config.descriptionVars) : config.description,
  }),
  error: (config = {}) => notificationApi?.error({
    ...config,
    message: typeof config.message === 'string' ? i18n.t(config.message, config.messageVars) : config.message,
    description: typeof config.description === 'string' ? i18n.t(config.description, config.descriptionVars) : config.description,
  }),
  info: (config = {}) => notificationApi?.info({
    ...config,
    message: typeof config.message === 'string' ? i18n.t(config.message, config.messageVars) : config.message,
    description: typeof config.description === 'string' ? i18n.t(config.description, config.descriptionVars) : config.description,
  }),
  warning: (config = {}) => notificationApi?.warning({
    ...config,
    message: typeof config.message === 'string' ? i18n.t(config.message, config.messageVars) : config.message,
    description: typeof config.description === 'string' ? i18n.t(config.description, config.descriptionVars) : config.description,
  }),
};

export const tModal = {
  confirm: (config = {}) => modalApi?.confirm({
    ...config,
    title: typeof config.title === 'string' ? i18n.t(config.title, config.titleVars) : config.title,
    content: typeof config.content === 'string' ? i18n.t(config.content, config.contentVars) : config.content,
    okText: config.okText ? i18n.t(config.okText) : i18n.t('common:buttons.ok'),
    cancelText: config.cancelText ? i18n.t(config.cancelText) : i18n.t('common:buttons.cancel'),
  }),
};
