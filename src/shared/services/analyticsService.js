const STORAGE_KEY = 'plannivo::analytics-events';

const enqueueEvent = (event) => {
  try {
    const existing = JSON.parse(window?.localStorage?.getItem(STORAGE_KEY) || '[]');
    existing.push(event);
    const trimmed = existing.slice(-100);
    window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Silently ignore storage issues (private browsing, quota, etc.)
  }
};

export const analyticsService = {
  track(eventName, payload = {}) {
    const event = {
      name: eventName,
      payload,
      timestamp: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...payload });
      }
      enqueueEvent(event);
    }

    return event;
  },
};
