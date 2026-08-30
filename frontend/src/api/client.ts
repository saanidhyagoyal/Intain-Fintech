import axios from 'axios';

/**
 * Centralized Axios client for all API calls.
 * Base URL is pulled from environment variable VITE_API_URL (defaults to '/api').
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── JWT Request Interceptor ──────────────────────────────────
// Automatically attaches Authorization: Bearer <token> to EVERY
// outgoing request. The token is extracted from the `user` object
// stored in localStorage at login time.
api.interceptors.request.use((config) => {
  // Primary: read token from the user session object
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
      }
    }
  } catch {
    // Malformed JSON in localStorage – ignore
  }

  // Fallback: also check a standalone 'token' key (legacy compat)
  if (!config.headers.Authorization) {
    const standaloneToken = localStorage.getItem('token');
    if (standaloneToken) {
      config.headers.Authorization = `Bearer ${standaloneToken}`;
    }
  }

  return config;
});

// ── 401 Response Interceptor ─────────────────────────────────
// If the backend returns 401 (expired/invalid token), clear the
// session and redirect to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
