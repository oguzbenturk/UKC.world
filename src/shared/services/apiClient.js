import axios from 'axios';

// Simple API client configuration
// In production, use relative URLs so nginx can proxy to backend
// In development, normalize the configured backend URL to avoid redirect-induced CORS failures while
// still defaulting to the local API when running the frontend on localhost.
const normalizeBaseUrl = (rawUrl = '') => {
  if (!rawUrl) {
    return '';
  }

  // Strip any trailing slashes to avoid double slash issues when composing paths
  const trimmedUrl = rawUrl.replace(/\/$/, '');

  // If the URL targets a remote host over HTTP, browsers will receive a 301 -> 307 redirect to HTTPS.
  // Preflight requests cannot follow redirects, which surfaces as a CORS error. Automatically upgrade
  // non-local HTTP origins to HTTPS to prevent the redirect in the first place.
  if (/^http:\/\/(?!localhost|127\.0\.0\.1)/i.test(trimmedUrl)) {
    return trimmedUrl.replace(/^http:/i, 'https:');
  }

  return trimmedUrl;
};

const LOCAL_DEV_DEFAULT = 'http://localhost:4000';

const isLikelyLocalHost = (host) => {
  if (!host) return false;
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized === '0.0.0.0') return true;
  if (normalized.startsWith('127.')) return true;
  if (normalized.endsWith('.local')) return true;
  // Private IPv4 ranges
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
};

export const resolveApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }

  const forcedRemote = import.meta.env.VITE_FORCE_REMOTE_BACKEND === 'true';
  const rawEnv = import.meta.env.VITE_BACKEND_URL;
  const normalizedEnv = normalizeBaseUrl(rawEnv);

  if (typeof window !== 'undefined') {
    const host = window.location?.hostname || '';
    if (isLikelyLocalHost(host) && !forcedRemote) {
      if (rawEnv && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1]))/i.test(rawEnv)) {
        return normalizeBaseUrl(rawEnv);
      }
      return normalizeBaseUrl(LOCAL_DEV_DEFAULT);
    }
  }

  return normalizedEnv || normalizeBaseUrl(LOCAL_DEV_DEFAULT);
};

const API_BASE_URL = resolveApiBaseUrl();

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL ? `${API_BASE_URL}/api` : '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Silent refresh state ---
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => {
    try { cb(newToken); } catch {}
  });
  refreshSubscribers = [];
};

const onRefreshFailed = (error) => {
  refreshSubscribers.forEach((cb) => {
    try { cb(null, error); } catch {}
  });
  refreshSubscribers = [];
};

// Use raw axios (no interceptors) to avoid recursion
async function refreshAuthToken(currentToken) {
  const baseUrl = resolveApiBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/auth/refresh` : '/api/auth/refresh';
  const headers = currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
  const res = await axios.post(url, {}, { headers });
  return res?.data?.token;
}

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Handle authentication errors with smarter conditions
      if (error.response.status === 401) {
        const originalRequest = error.config || {};
        const reqUrl = (originalRequest.url || '').toString();
        const hasToken = !!localStorage.getItem('token');

        // Endpoints that may legitimately be called before auth
        // and should NOT trigger global logout/redirect on 401
        const skipRedirectPaths = [
          '/settings',
          '/currencies/active',
          '/services/categories/list',
          '/auth/login',
          '/auth/refresh'
        ];

        const shouldSkip = skipRedirectPaths.some(p => reqUrl.endsWith(p));

        // If no token or should skip, bubble up the auth error
        if (!hasToken || shouldSkip) {
          error.isAuthError = true;
          error.authMessage = 'Authentication required';
          return Promise.reject(error);
        }

        // Try silent refresh once per request
        if (!originalRequest._retry) {
          originalRequest._retry = true;
          const currentToken = localStorage.getItem('token');

          // If a refresh is already in progress, queue this request
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              subscribeTokenRefresh((newToken, refreshErr) => {
                if (refreshErr || !newToken) {
                  reject(error);
                  return;
                }
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                resolve(apiClient(originalRequest));
              });
            });
          }

          // Start refresh
          isRefreshing = true;
          return refreshAuthToken(currentToken)
            .then((newToken) => {
              if (newToken) {
                localStorage.setItem('token', newToken);
                apiClient.defaults.headers.Authorization = `Bearer ${newToken}`;
                onRefreshed(newToken);
                // Retry original request with new token
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(originalRequest);
              }
              throw new Error('No token returned from refresh');
            })
            .catch((refreshErr) => {
              onRefreshFailed(refreshErr);
              // eslint-disable-next-line no-console
              console.warn('🔒 Session expired and refresh failed - clearing auth and redirecting');
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('currentUser');
              localStorage.removeItem('userRole');
              error.isAuthError = true;
              error.authMessage = 'Your session has expired. Please log in again.';
              window.dispatchEvent(new Event('sessionExpired'));
              if (window.location.pathname !== '/login') {
                // eslint-disable-next-line no-console
                console.log('🔄 Redirecting to login page after failed refresh');
                window.location.href = '/login';
              }
              return Promise.reject(error);
            })
            .finally(() => {
              isRefreshing = false;
            });
        }

        // Already retried and still 401 – proceed with logout/redirect
        // eslint-disable-next-line no-console
        console.warn('🔒 Session expired after retry - clearing auth and redirecting');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userRole');
        error.isAuthError = true;
        error.authMessage = 'Your session has expired. Please log in again.';
        window.dispatchEvent(new Event('sessionExpired'));
        if (window.location.pathname !== '/login') {
          // eslint-disable-next-line no-console
          console.log('🔄 Redirecting to login page');
          window.location.href = '/login';
        }
      } else if (error.response.status === 403) {
        error.isAuthError = true;
        error.authMessage = 'You do not have permission to perform this action.';
      } else if (error.response.status === 500) {
        error.serverError = true;
        error.serverMessage = 'A server error occurred. Please try again later.';
      }
    } else if (error.request) {
      error.networkError = true;
      error.networkMessage = 'Unable to connect to the server. Please check your internet connection.';
    }
    
    return Promise.reject(error);
  }
);

// Add debug cache stats method for ApiDebugPanel
apiClient.getCacheStats = () => {
  return {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheSize: 0,
    lastUpdated: new Date().toISOString(),
    note: 'Cache stats not implemented yet'
  };
};

export default apiClient;
export { API_BASE_URL };
