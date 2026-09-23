import { beginApiLoading, endApiLoading, apiLoadingLabelFor } from '../lib/apiLoadingBridge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3303';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('helpdesk_token');
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('helpdesk_token', token);
  else localStorage.removeItem('helpdesk_token');
}

export async function api(path, options = {}) {
  const { silent = false, loaderLabel, ...fetchOptions } = options;
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const showLoader = !silent && typeof window !== 'undefined';

  if (showLoader) {
    beginApiLoading(loaderLabel || apiLoadingLabelFor(method, path));
  }

  try {
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(fetchOptions.headers || {}),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      body: fetchOptions.body !== undefined
        ? typeof fetchOptions.body === 'string' || isFormData
          ? fetchOptions.body
          : JSON.stringify(fetchOptions.body)
        : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_e) {
      data = null;
    }

    if (!res.ok) {
      const err = new Error(data?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    if (showLoader) endApiLoading();
  }
}

export const authApi = {
  login: (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password }, loaderLabel: 'Signing in…' }),
  logout: () => api('/api/auth/logout', { method: 'POST', loaderLabel: 'Signing out…' }),
  me: () => api('/api/auth/me', { silent: true }),
  updateProfile: (body) => api('/api/auth/profile', { method: 'PATCH', body }),
  forgotPassword: (email) => api('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => api('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
  setupPassword: (token, password) => api('/api/auth/setup-password', { method: 'POST', body: { token, password } }),
  changePassword: (currentPassword, newPassword) =>
    api('/api/auth/change-password', { method: 'PATCH', body: { currentPassword, newPassword } }),
};

export const usersApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/api/users${q ? `?${q}` : ''}`);
  },
  directory: () => api('/api/users/directory'),
  approvers: () => api('/api/users/approvers'),
  executives: () => api('/api/users/executives'),
  get: (id) => api(`/api/users/${id}`),
  create: (body) => api('/api/users', { method: 'POST', body }),
  update: (id, body) => api(`/api/users/${id}`, { method: 'PUT', body }),
  updateStatus: (id, status) => api(`/api/users/${id}/status`, { method: 'PATCH', body: { status } }),
  updateRole: (id, role_id) => api(`/api/users/${id}/role`, { method: 'PATCH', body: { role_id } }),
  sendPasswordSetup: (id) => api(`/api/users/${id}/send-password-setup`, { method: 'POST' }),
  remove: (id) => api(`/api/users/${id}`, { method: 'DELETE' }),
};

export const rolesApi = {
  list: () => api('/api/roles'),
  get: (id) => api(`/api/roles/${id}`),
  create: (body) => api('/api/roles', { method: 'POST', body }),
  update: (id, body) => api(`/api/roles/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/api/roles/${id}`, { method: 'DELETE' }),
  users: (id) => api(`/api/roles/${id}/users`),
  permissions: (id) => api(`/api/roles/${id}/permissions`),
  setPermissions: (id, permissions) => api(`/api/roles/${id}/permissions`, { method: 'PUT', body: { permissions } }),
};

export const modulesApi = { list: () => api('/api/modules') };
export const departmentsApi = {
  list: () => api('/api/departments'),
  create: (name) => api('/api/departments', { method: 'POST', body: { name } }),
};
export const ticketsApi = {
  list: (opts) => api('/api/tickets', opts || {}),
  get: (id) => api(`/api/tickets/${id}`),
  create: (body) => api('/api/tickets', { method: 'POST', body }),
  update: (id, body) => api(`/api/tickets/${id}`, { method: 'PUT', body }),
  inProgress: (id) => api(`/api/tickets/${id}/in-progress`, { method: 'PATCH' }),
  hold: (id, holdReason) => api(`/api/tickets/${id}/hold`, { method: 'PATCH', body: { reason: holdReason, hold_reason: holdReason } }),
  resume: (id) => api(`/api/tickets/${id}/resume`, { method: 'PATCH' }),
  resolve: (id, note) => api(`/api/tickets/${id}/resolve`, { method: 'PATCH', body: { note: note || 'Ticket marked resolved' } }),
  reply: (id, text) => api(`/api/tickets/${id}/reply`, { method: 'POST', body: { text } }),
};
export const requisitionsApi = {
  list: (opts) => api('/api/requisitions', opts || {}),
  get: (id) => api(`/api/requisitions/${id}`),
  create: (body) => api('/api/requisitions', { method: 'POST', body }),
  approve: (id) => api(`/api/requisitions/${id}/approve`, { method: 'PATCH' }),
  reject: (id) => api(`/api/requisitions/${id}/reject`, { method: 'PATCH' }),
  hold: (id, holdReason) => api(`/api/requisitions/${id}/hold`, { method: 'PATCH', body: { reason: holdReason, hold_reason: holdReason } }),
  reply: (id, text) => api(`/api/requisitions/${id}/reply`, { method: 'POST', body: { text } }),
};
export const vendorsApi = {
  list: () => api('/api/vendors'),
  create: (body) => api('/api/vendors', { method: 'POST', body }),
  update: (id, body) => api(`/api/vendors/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/api/vendors/${id}`, { method: 'DELETE' }),
};
export const procurementApi = {
  list: () => api('/api/procurement'),
  create: (body) => api('/api/procurement', { method: 'POST', body }),
  update: (id, body) => api(`/api/procurement/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/api/procurement/${id}`, { method: 'DELETE' }),
};
export const assetsApi = {
  mine: () => api('/api/assets/mine'),
  list: () => api('/api/assets'),
  nextCode: () => api('/api/assets/next-code'),
  create: (body) => api('/api/assets', { method: 'POST', body }),
  update: (id, body) => api(`/api/assets/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/api/assets/${id}`, { method: 'DELETE' }),
};
export const kbApi = { list: (category) => api(`/api/kb${category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : ''}`), get: (id) => api(`/api/kb/${id}`) };
export const emailTemplatesApi = {
  list: () => api('/api/email-templates'),
  create: (body) => api('/api/email-templates', { method: 'POST', body }),
  update: (id, body) => api(`/api/email-templates/${id}`, { method: 'PUT', body }),
  remove: (id) => api(`/api/email-templates/${id}`, { method: 'DELETE' }),
};
export const notificationsApi = {
  list: () => api('/api/notifications', { silent: true }),
  clear: () => api('/api/notifications', { method: 'DELETE' }),
};
export const logsApi = {
  list: () => api('/api/logs'),
  clear: () => api('/api/logs', { method: 'DELETE' }),
};
export const settingsApi = {
  get: () => api('/api/settings'),
  update: (body) => api('/api/settings', { method: 'PUT', body }),
  getSmtp: () => api('/api/settings/smtp'),
  updateSmtp: (body) => api('/api/settings/smtp', { method: 'PUT', body }),
  testSmtp: (to) => api('/api/settings/smtp/test', { method: 'POST', body: { to } }),
  getFileEncryption: () => api('/api/settings/file-encryption'),
  updateFileEncryption: (body) => api('/api/settings/file-encryption', { method: 'PUT', body }),
  clearFileEncryption: () => api('/api/settings/file-encryption', { method: 'DELETE' }),
  getOpenAI: () => api('/api/settings/openai'),
  updateOpenAI: (body) => api('/api/settings/openai', { method: 'PUT', body }),
};
export const catalogApi = {
  list: (type) => api(`/api/catalog${type ? `?type=${encodeURIComponent(type)}` : ''}`),
};

export const uploadsApi = {
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api('/api/uploads', { method: 'POST', body: fd, loaderLabel: 'Uploading…' });
  },
  /** Decrypt-download via API (auth required) and open in a new tab */
  open: async (urlOrPath) => {
    const path = urlOrPath.startsWith('http')
      ? new URL(urlOrPath).pathname
      : urlOrPath;
    const token = typeof window !== 'undefined' ? localStorage.getItem('helpdesk_token') : null;
    beginApiLoading('Opening file…');
    try {
      const res = await fetch(`${API_URL}${path}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = new Error('Could not open attachment');
        err.status = res.status;
        throw err;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    } finally {
      endApiLoading();
    }
  },
};

export const aiApi = {
  improve: (text, type) => api('/api/ai/improve', { method: 'POST', body: { text, type } }),
};

export { API_URL };
