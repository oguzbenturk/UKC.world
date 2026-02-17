/**
 * AntdStaticHolder Component
 * 
 * This component must be rendered inside <App> (from antd) to capture
 * the context-aware message/notification/modal APIs and make them available
 * for static usage throughout the app.
 */
import { useEffect } from 'react';
import { App } from 'antd';
import { setAntdStaticApis } from '@/shared/utils/antdStatic';

const AntdStaticHolder = () => {
  const { message, notification, modal } = App.useApp();
  
  useEffect(() => {
    setAntdStaticApis({ message, notification, modal });
  }, [message, notification, modal]);
  
  return null;
};

export default AntdStaticHolder;
