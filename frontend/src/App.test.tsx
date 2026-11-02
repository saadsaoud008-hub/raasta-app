import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import App from './App';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ farePaisa: 48000, etaMinutes: 4 }),
    }),
  );
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('disables booking until locations and quote are ready', async () => {
  render(<App />);
  expect(
    screen.getByRole('button', { name: /request a ride/i }),
  ).toBeDisabled();
  await screen.findByText('480', { exact: false });
});

it('receives WebSocket updates and refreshes manually without five-second polling', async () => {
  class MockSocket {
    static instances: MockSocket[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor() { MockSocket.instances.push(this); }
    close() { this.closed = true; }
  }
  vi.stubGlobal('WebSocket', MockSocket);
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let current = {
    id, pickup: 'Gulberg', destination: 'DHA', category: 'ECONOMY', status: 'REQUESTED',
    fare_paisa: 48000, eta_minutes: 4, driver_id: null as string | null,
    driver_name: null as string | null, vehicle: null, plate: null,
  };
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    const body = String(url).includes('/quotes') ? { farePaisa: 48000, etaMinutes: 4 }
      : String(url).endsWith('/drivers') ? [] : { ...current, id: options?.method === 'PUT' ? String(url).split('/').at(-1) : current.id };
    if (options?.method === 'PUT') current = { ...current, id: (body as typeof current).id };
    return { ok: true, json: async () => body } as Response;
  });
  render(<App />);
  await screen.findByText('480', { exact: false });
  fireEvent.change(screen.getByLabelText('Pickup location'), { target: { value: 'Gulberg' } });
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'DHA' } });
  fireEvent.click(screen.getByRole('button', { name: /request a ride/i }));
  await screen.findByRole('heading', { name: /finding your next ride/i });
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  current = { ...current, status: 'ACCEPTED', driver_id: 'driver', driver_name: 'Ali' };
  act(() => MockSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'ride.updated', ride: current }) } as MessageEvent));
  await screen.findByRole('heading', { name: /your driver is on the way/i });
  expect(screen.getByText('Live updates connected')).toBeInTheDocument();
  vi.useFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(vi.mocked(fetch).mock.calls.filter(([url, options]) => String(url).endsWith(`/rides/${current.id}`) && !options?.method)).toHaveLength(0);
  vi.useRealTimers();
  current = { ...current, status: 'COMPLETED' };
  fireEvent.click(screen.getByRole('button', { name: /refresh status/i }));
  await screen.findByRole('heading', { name: /you've arrived/i });
  expect(MockSocket.instances[0].closed).toBe(true);
});
it('shows loading then a booking error and allows retry', async () => {
  let rejectBooking: (reason: Error) => void = () => {};
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    if (options?.method === 'PUT')
      return new Promise((_resolve, reject) => {
        rejectBooking = reject;
      });
    return {
      ok: true,
      json: async () => ({ farePaisa: 48000, etaMinutes: 4 }),
    } as Response;
  });
  render(<App />);
  await screen.findByText('480', { exact: false });
  fireEvent.change(screen.getByLabelText('Pickup location'), {
    target: { value: 'Gulberg' },
  });
  fireEvent.change(screen.getByLabelText('Destination'), {
    target: { value: 'DHA' },
  });
  fireEvent.click(screen.getByRole('button', { name: /request a ride/i }));
  expect(
    await screen.findByRole('button', { name: /requesting your ride/i }),
  ).toBeDisabled();
  rejectBooking(new Error('No connection. Please retry.'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /request a ride/i }),
    ).toBeEnabled(),
  );
  const first = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === 'PUT');
  fireEvent.click(screen.getByRole('button', { name: /request a ride/i }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(2));
  const attempts = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PUT');
  expect(attempts[1][0]).toBe(first?.[0]);
  expect(first?.[0]).toMatch(/\/api\/rides\/[0-9a-f-]{36}$/);
  expect(new Headers(attempts[1][1]?.headers).has('Idempotency-Key')).toBe(false);
});
