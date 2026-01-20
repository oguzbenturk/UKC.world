/**
 * Antd Static API Holder
 * 
 * This module provides static access to antd's message, notification, and modal APIs
 * while properly consuming context (theme, locale, etc.)
 * 
 * Usage:
 * import { message, notification, modal } from '@/shared/utils/antdStatic';
 * message.success('It works!');
 */

let messageApi = null;
let notificationApi = null;
let modalApi = null;

export const setAntdStaticApis = (apis) => {
  messageApi = apis.message;
  notificationApi = apis.notification;
  modalApi = apis.modal;
};

// Proxy objects that delegate to the real APIs once initialized
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
