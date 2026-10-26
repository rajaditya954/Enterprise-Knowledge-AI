const API_BASE = '/api';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    ...(options.headers || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 — try refresh
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      return fetch(url, { ...options, headers, credentials: 'include' });
    }
  }

  return response;
}

async function refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      accessToken = data.accessToken;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Auth ───

export async function login(email, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  accessToken = data.accessToken;
  return data;
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' });
  accessToken = null;
}

export async function getMe() {
  const res = await request('/auth/me');
  if (!res.ok) return null;
  return res.json();
}

// ─── Chat ───

export function streamQuery(question, conversationId, onDelta, onDone, onError) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await request('/chat/query', {
        method: 'POST',
        body: JSON.stringify({ question, conversationId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        onError(data.error || 'Query failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'delta') {
              onDelta(data);
            } else if (eventType === 'done') {
              onDone(data);
            } else if (eventType === 'conversation') {
              onDelta({ conversationId: data.conversationId });
            } else if (eventType === 'error') {
              onError(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err.message);
      }
    }
  })();

  return () => controller.abort();
}

// ─── Documents ───

export async function listDocuments(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/documents?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function uploadDocumentFile(formData) {
  const res = await request('/documents', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function deleteDocumentApi(id) {
  const res = await request(`/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
  return res.json();
}

export async function reindexDocumentApi(id) {
  const res = await request(`/documents/${id}/reindex`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reindex');
  return res.json();
}

// ─── Conversations ───

export async function listConversations(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/conversations?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function getConversation(id) {
  const res = await request(`/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch conversation');
  return res.json();
}

export async function deleteConversation(id) {
  const res = await request(`/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete conversation');
  return res.json();
}

// ─── Admin ───

export async function listUsers() {
  const res = await request('/admin/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function createUser(data) {
  const res = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to create user');
  return result;
}

export async function updateUser(id, data) {
  const res = await request(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to update user');
  return result;
}

export async function listAuditLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/admin/audit-logs?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function listDepartments() {
  const res = await request('/admin/departments');
  if (!res.ok) throw new Error('Failed to fetch departments');
  return res.json();
}

export async function getRbacInfo() {
  const res = await request('/admin/rbac');
  if (!res.ok) throw new Error('Failed to fetch RBAC info');
  return res.json();
}
