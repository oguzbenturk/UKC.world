import { useCallback, useContext, useEffect } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';

const DEFAULT_MESSAGE = 'You have unsaved changes. Are you sure you want to leave this page?';

/**
 * Warn users before navigating away when there are unsaved changes.
 * Shows the native browser prompt on refresh/close and delegates to a custom
 * confirmation function for in-app route transitions.
 *
 * @param {boolean} when - Whether the guard should be active.
 * @param {Object} options
 * @param {string} [options.message] - Custom confirmation message.
 * @param {() => (boolean|Promise<boolean>)} [options.confirm] - Optional confirmation factory.
 */
const useUnsavedChangesPrompt = (when, options = {}) => {
  const navigation = useContext(UNSAFE_NavigationContext);
  const { message = DEFAULT_MESSAGE, confirm } = options;

  const confirmTransition = useCallback(() => {
    if (typeof confirm === 'function') {
      try {
        const result = confirm();
        if (result instanceof Promise) {
          return result.catch(() => false);
        }
        return Promise.resolve(Boolean(result));
      } catch {
        return Promise.resolve(false);
      }
    }

    const choice = window.confirm(message);
    return Promise.resolve(choice);
  }, [confirm, message]);

  useEffect(() => {
    if (!when) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message, when]);

  useEffect(() => {
    if (!when || !navigation?.navigator?.block) {
      return undefined;
    }

    const unblock = navigation.navigator.block((transition) => {
      confirmTransition().then((shouldProceed) => {
        if (shouldProceed) {
          unblock();
          transition.retry();
        }
      });
    });

    return unblock;
  }, [confirmTransition, navigation?.navigator, when]);
};

export default useUnsavedChangesPrompt;
