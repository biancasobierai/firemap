const KEY = 'firemap_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = t => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

let onExpired = () => {};
export const onUnauthorized = fn => { onExpired = fn; };

async function call(url, opts = {}) {
  const token = getToken();
  const r = await fetch('/api' + url, {
    method: opts.method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }) },
    body: opts.body && JSON.stringify(opts.body),
  }).catch(() => { throw new Error('Não foi possível conectar ao servidor.'); });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/auth/login') onExpired();
  if (!r.ok) throw new Error(j.error || 'Erro na requisição');
  return j;
}
export const api = {
  login: (email, password) => call('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => call('/auth/me'),
  list: () => call('/extinguishers'),
  save: e => e.id ? call('/extinguishers/' + e.id, { method: 'PUT', body: e }) : call('/extinguishers', { method: 'POST', body: e }),
  remove: id => call('/extinguishers/' + id, { method: 'DELETE' }),
  plans: () => call('/plans'),
  savePlan: p => p.id ? call('/plans/' + p.id, { method: 'PUT', body: p }) : call('/plans', { method: 'POST', body: p }),
  removePlan: id => call('/plans/' + id, { method: 'DELETE' }),
  dashboard: () => call('/dashboard'),
  alerts: () => call('/alerts'),
  chat: messages => call('/chat', { method: 'POST', body: { messages } }),
};
