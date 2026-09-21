const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body !== undefined
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
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
}

export const authApi = {
  login: (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api('/api/auth/me'),
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
  list: () => api('/api/tickets'),
  get: (id) => api(`/api/tickets/${id}`),
  create: (body) => api('/api/tickets', { method: 'POST', body }),
  update: (id, body) => api(`/api/tickets/${id}`, { method: 'PUT', body }),
  inProgress: (id) => api(`/api/tickets/${id}/in-progress`, { method: 'PATCH' }),
  hold: (id, holdReason) => api(`/api/tickets/${id}/hold`, { method: 'PATCH', body: { holdReason } }),
  resume: (id) => api(`/api/tickets/${id}/resume`, { method: 'PATCH' }),
  resolve: (id) => api(`/api/tickets/${id}/resolve`, { method: 'PATCH' }),
  reply: (id, text) => api(`/api/tickets/${id}/replies`, { method: 'POST', body: { text } }),
};
export const requisitionsApi = {
  list: () => api('/api/requisitions'),
  get: (id) => api(`/api/requisitions/${id}`),
  create: (body) => api('/api/requisitions', { method: 'POST', body }),
  approve: (id) => api(`/api/requisitions/${id}/approve`, { method: 'PATCH' }),
  reject: (id) => api(`/api/requisitions/${id}/reject`, { method: 'PATCH' }),
  hold: (id, holdReason) => api(`/api/requisitions/${id}/hold`, { method: 'PATCH', body: { holdReason } }),
  reply: (id, text) => api(`/api/requisitions/${id}/replies`, { method: 'POST', body: { text } }),
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
  list: () => api('/api/notifications'),
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
};
export const catalogApi = {
  list: (type) => api(`/api/catalog${type ? `?type=${encodeURIComponent(type)}` : ''}`),
};

export { API_URL };
