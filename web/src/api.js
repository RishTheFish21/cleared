import { useEffect, useRef, useState, useCallback } from 'react';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Fetch a resource and keep it fresh by polling. */
export function usePolling(path, intervalMs = 2000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setData(null);
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}

export const money = (cents) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const timeAgo = (iso) => {
  const s = Math.round((Date.now() - Date.parse(iso.endsWith('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
