// Thin fetch wrapper for the Flask JSON API. `credentials: 'include'` sends the
// Flask-Login `__session` cookie set by /authorize — same-origin in production
// (Firebase Hosting rewrites), proxied to 127.0.0.1:5000 in dev (vite.config.js).

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
};
