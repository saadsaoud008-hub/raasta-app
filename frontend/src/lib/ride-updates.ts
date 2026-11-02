import { apiBaseUrl } from './http';
import type { Ride } from '../features/rides/types';

export type LiveStatus = 'connecting' | 'connected' | 'disconnected';

export function watchRide(id: string, onRide: (ride: Ride) => void, onStatus: (status: LiveStatus) => void) {
  const url = new URL(`${apiBaseUrl}/rides/${id}/live`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket: WebSocket;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let attempts = 0;
  function connect() {
    if (stopped) return;
    onStatus('connecting');
    try { socket = new WebSocket(url); } catch { retry(); return; }
    socket.onmessage = message => {
      try {
        const data = JSON.parse(message.data);
        if (data.type === 'ride.updated' && data.ride?.id === id &&
          ['REQUESTED', 'ACCEPTED', 'CANCELLED', 'COMPLETED'].includes(data.ride.status)) {
          attempts = 0;
          onStatus('connected');
          onRide(data.ride);
        }
      } catch { /* Leave current state visible; manual refresh remains available. */ }
    };
    socket.onerror = () => { if (!stopped) onStatus('disconnected'); };
    socket.onclose = event => {
      if (stopped) return;
      onStatus('disconnected');
      if (event.code !== 1008) retry();
    };
  }
  function retry() {
    if (stopped) return;
    onStatus('disconnected');
    const wait = Math.min(10000, 1000 * 2 ** Math.min(attempts++, 4)) + Math.random() * 500;
    timer = setTimeout(connect, wait);
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (socket) {
      socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  };
}

// Late HTTP replies or frames must not move an accepted/completed ride backwards.
export function latestRide(current: Ride | null, next: Ride): Ride {
  if (!current || current.id !== next.id) return next;
  const rank = { REQUESTED: 0, ACCEPTED: 1, CANCELLED: 2, COMPLETED: 2 };
  if (rank[next.status] < rank[current.status]) return current;
  if (rank[current.status] === 2 && next.status !== current.status) return current;
  if (next.status === current.status && current.updated_at && next.updated_at &&
    Date.parse(next.updated_at) < Date.parse(current.updated_at)) return current;
  return next;
}
