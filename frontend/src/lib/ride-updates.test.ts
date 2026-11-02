import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { latestRide, watchRide } from './ride-updates';
import type { Ride } from '../features/rides/types';

const ride: Ride = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pickup: 'Gulberg', destination: 'DHA',
  category: 'ECONOMY', status: 'REQUESTED', fare_paisa: 48000, eta_minutes: 4,
  driver_id: null, driver_name: null, vehicle: null, plate: null,
};
class MockSocket {
  static instances: MockSocket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: URL) { MockSocket.instances.push(this); }
  close() { this.closed = true; }
  receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}
beforeEach(() => {
  MockSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockSocket);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('uses one browser connection and does not poll HTTP while receiving live updates', async () => {
  const receive = vi.fn(); const state = vi.fn(); const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const stop = watchRide(ride.id, receive, state);
  expect(MockSocket.instances).toHaveLength(1);
  const socket = MockSocket.instances[0];
  expect(socket.url.protocol).toBe('ws:');
  expect(socket.url.pathname).toBe(`/api/rides/${ride.id}/live`);
  socket.receive({ type: 'ride.updated', ride });
  expect(receive).toHaveBeenCalledWith(ride);
  expect(state).toHaveBeenLastCalledWith('connected');
  await vi.advanceTimersByTimeAsync(15000);
  expect(fetch).not.toHaveBeenCalled();
  expect(MockSocket.instances).toHaveLength(1);
  stop();
  expect(socket.closed).toBe(true);
});

it('reconnects after disconnect, receives the current snapshot, and stops retrying after cleanup', async () => {
  const receive = vi.fn(); const state = vi.fn();
  const stop = watchRide(ride.id, receive, state);
  MockSocket.instances[0].onclose?.({ code: 1006 } as CloseEvent);
  expect(state).toHaveBeenLastCalledWith('disconnected');
  await vi.advanceTimersByTimeAsync(1500);
  expect(MockSocket.instances).toHaveLength(2);
  MockSocket.instances[1].receive({ type: 'ride.updated', ride: { ...ride, status: 'ACCEPTED' } });
  expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ACCEPTED' }));
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(MockSocket.instances).toHaveLength(2);
});

it('does not retry an invalid or forbidden ride subscription', async () => {
  const stop = watchRide(ride.id, vi.fn(), vi.fn());
  MockSocket.instances[0].onclose?.({ code: 1008 } as CloseEvent);
  await vi.advanceTimersByTimeAsync(30000);
  expect(MockSocket.instances).toHaveLength(1);
  stop();
});

it('ignores other rides and invalid messages', () => {
  const receive = vi.fn();
  const stop = watchRide(ride.id, receive, vi.fn());
  MockSocket.instances[0].receive({ type: 'ride.updated', ride: { ...ride, id: 'different' } });
  MockSocket.instances[0].receive({ type: 'ride.updated', ride: { ...ride, status: 'UNKNOWN' } });
  expect(receive).not.toHaveBeenCalled();
  stop();
});

it('does not let stale replies move the ride backwards', () => {
  const accepted = { ...ride, status: 'ACCEPTED' as const };
  const completed = { ...ride, status: 'COMPLETED' as const };
  expect(latestRide(accepted, ride)).toBe(accepted);
  expect(latestRide(completed, accepted)).toBe(completed);
  expect(latestRide(accepted, completed)).toBe(completed);
});
