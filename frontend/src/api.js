/**
 * API Service — Central HTTP client for all backend communication.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
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

// ═══════════════ Auth ═══════════════
export const authAPI = {
  login: (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  },
  register: (data) => api.post('/api/auth/register', data),
  getMe: () => api.get('/api/auth/me'),
};

// ═══════════════ Cases ═══════════════
export const casesAPI = {
  list: () => api.get('/api/cases'),
  get: (id) => api.get(`/api/cases/${id}`),
  create: (data) => api.post('/api/cases', data),
  delete: (id) => api.delete(`/api/cases/${id}`),
  resetClean: () => api.post('/api/cases/reset-clean'),
  toggleStandingAuth: (id) => api.patch(`/api/cases/${id}/standing-auth`),
};

// ═══════════════ Upload ═══════════════
export const uploadAPI = {
  upload: (caseId, file, dataType, personName = null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('data_type', dataType);
    if (personName) formData.append('person_name', personName);
    return api.post(`/api/cases/${caseId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  seedDemo: (caseId) => api.post(`/api/cases/${caseId}/seed-demo`),
};


// ═══════════════ Graph ═══════════════
export const graphAPI = {
  getGraph: (caseId) => api.get(`/api/cases/${caseId}/graph`),
  getPersons: (caseId) => api.get(`/api/cases/${caseId}/persons`),
  getPersonDetail: (caseId, personId) => api.get(`/api/cases/${caseId}/persons/${personId}`),
  getHierarchy: (caseId) => api.get(`/api/cases/${caseId}/hierarchy`),
  overrideScore: (caseId, personId, value, reason) =>
    api.post(`/api/cases/${caseId}/persons/${personId}/override-score`, { override_value: value, reason }),
};

// ═══════════════ Pattern Detection ═══════════════
export const detectionAPI = {
  runDetectors: (caseId) => api.post(`/api/cases/${caseId}/detect-patterns`),
  getAlerts: (caseId) => api.get(`/api/cases/${caseId}/alerts`),
  reviewAlert: (caseId, alertId, status) => api.patch(`/api/cases/${caseId}/alerts/${alertId}`, { status }),
};

// ═══════════════ Approvals ═══════════════
export const approvalsAPI = {
  list: (caseId) => api.get(`/api/cases/${caseId}/approvals`),
  create: (caseId, data) => api.post(`/api/cases/${caseId}/approvals`, data),
  decide: (caseId, approvalId, status) => api.patch(`/api/cases/${caseId}/approvals/${approvalId}`, { status }),
};

// ═══════════════ Timeline ═══════════════
export const timelineAPI = {
  getEvents: (caseId) => api.get(`/api/cases/${caseId}/events`),
  getPastTimeline: (caseId) => api.get(`/api/cases/${caseId}/timeline/past`),
  getPredictedTimeline: (caseId) => api.get(`/api/cases/${caseId}/timeline/predicted`),
};

// ═══════════════ Location ═══════════════
export const locationAPI = {
  getTrail: (caseId, personId) => api.get(`/api/cases/${caseId}/locations/${personId}`),
  getAllTracked: (caseId) => api.get(`/api/cases/${caseId}/locations`),
  getMeetups: (caseId) => api.get(`/api/cases/${caseId}/meetups`),
};

// ═══════════════ Audit Logs ═══════════════
export const auditAPI = {
  getLogs: (caseId = null) => api.get('/api/audit-logs', { params: caseId ? { case_id: caseId } : {} }),
};

// ═══════════════ Custom Rules ═══════════════
export const rulesAPI = {
  list: (caseId) => api.get(`/api/cases/${caseId}/custom-rules`),
  create: (caseId, data) => api.post(`/api/cases/${caseId}/custom-rules`, data),
};

// ═══════════════ Forecasting ═══════════════
export const forecastAPI = {
  run: (caseId) => api.post(`/api/cases/${caseId}/forecast`),
};

export const investigatorAPI = {
  ask: (caseId, question, selectedPersonId = null) =>
    api.post('/api/investigator/ask', {
      case_id: caseId,
      question,
      selected_person_id: selectedPersonId,
    }),
  askStream: (caseId, question, selectedPersonId = null) => {
    const token = localStorage.getItem('token');
    return fetch(`${api.defaults.baseURL || ''}/api/investigator/ask/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        case_id: caseId,
        question,
        selected_person_id: selectedPersonId,
      })
    });
  },
  getSuggestions: (caseId) => api.get(`/api/investigator/suggestions/${caseId}`),
};

// ═══════════════ WebSocket ═══════════════
const getWsBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/^http(s?):\/\//, 'ws$1://');
  }
  if (typeof window !== 'undefined' && window.location.host && !import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:8000';
};

export const createGraphWebSocket = (caseId) => {
  const wsBase = getWsBase();
  return new WebSocket(`${wsBase}/ws/graph/${caseId}`);
};

export const createLocationWebSocket = (caseId) => {
  const wsBase = getWsBase();
  return new WebSocket(`${wsBase}/ws/location/${caseId}`);
};

export default api;
