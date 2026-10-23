const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
const TOKEN_KEY = 'objectos.session.token';
export interface AuthResult { token: string; user: { id: string; email: string }; expiresInDays: number }
export interface QueuedChange { id: string; method: 'POST'|'PUT'|'DELETE'; body?: unknown; createdAt: string; attempts?: number; lastError?: string }

export function getSessionToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setSessionToken(token: string | null): void {
  try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* Private browsing may disable session storage. */ }
}
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(`${body.error ?? 'API request failed'} (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function authenticate(mode: 'login'|'register', email: string, password: string, householdName = 'My household'): Promise<AuthResult> {
  const result = await apiRequest<AuthResult>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, ...(mode === 'register' ? { householdName } : {}) }) });
  setSessionToken(result.token);
  return result;
}
export async function logout(): Promise<void> {
  try { if (getSessionToken()) await apiRequest<void>('/auth/logout', { method: 'POST' }); }
  finally { setSessionToken(null); }
}
export async function checkApi(): Promise<boolean> {
  try { const result = await apiRequest<{status:string}>('/health'); return result.status === 'ok'; }
  catch { return false; }
}
export async function syncOutbox(changes: QueuedChange[], clear: (id: string) => Promise<void>, update: (change: QueuedChange) => Promise<void>): Promise<{ synced: number; pending: number; error?: string }> {
  if (!getSessionToken()) return { synced: 0, pending: changes.length, error: 'Sign in to sync changes to your household.' };
  let synced = 0;
  for (const change of changes) {
    try {
      const body = change.body as { id?: string } | undefined;
      if (change.method === 'DELETE') {
        const id = body?.id;
        if (!id) throw new Error('Queued delete is missing its record ID.');
        try { await apiRequest<void>(`/objects/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
        catch (error) { if (!(error instanceof Error && error.message.includes('(404)'))) throw error; }
      } else {
        if (!body || typeof body.id !== 'string') throw new Error('Queued change is missing its record ID.');
        const method = change.method === 'POST' ? 'POST' : 'PUT';
        const path = method === 'POST' ? '/objects' : `/objects/${encodeURIComponent(body.id)}`;
        try { await apiRequest(path, { method, body: JSON.stringify(body) }); }
        catch (error) {
          // Idempotent recovery: POST conflict may mean an earlier request succeeded before the client lost its response.
          if (method === 'POST' && error instanceof Error && error.message.includes('(409)')) {
            await apiRequest(`/objects/${encodeURIComponent(body.id)}`, { method: 'PUT', body: JSON.stringify(body) });
          } else throw error;
        }
      }
      await clear(change.id); synced++;
    } catch (error) {
      const attempts = (change.attempts ?? 0) + 1;
      await update({ ...change, attempts, lastError: error instanceof Error ? error.message : 'Sync failed' });
      return { synced, pending: changes.length - synced, error: error instanceof Error ? error.message : 'Sync failed' };
    }
  }
  return { synced, pending: 0 };
}
