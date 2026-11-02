import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/http';
import { latestRide, watchRide, type LiveStatus } from '../../lib/ride-updates';
import type { Category, Driver, Ride } from './types';
const RIDER = '11111111-1111-4111-8111-111111111111';
export function useRideBooking() {
  const [pickup, setPickup] = useState(''),
    [destination, setDestination] = useState('');
  const [category, setCategory] = useState<Category>('ECONOMY'),
    [ride, setRide] = useState<Ride | null>(null);
  const [quote, setQuote] = useState<{
    farePaisa: number;
    etaMinutes: number;
  } | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState(false),
    [quoteAttempt, setQuoteAttempt] = useState(0);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
  const [refreshing, setRefreshing] = useState(false);
  const terminal = Boolean(ride && ['CANCELLED', 'COMPLETED'].includes(ride.status));
  const applyRide = useCallback((next: Ride) => {
    setRide(current => current?.id === next.id ? latestRide(current, next) : current);
  }, []);
  const pendingRide = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setQuote(null);
    setQuoteError(false);
    api<{ farePaisa: number; etaMinutes: number }>(
      `/quotes?category=${category}`,
      { signal: c.signal },
    )
      .then(setQuote)
      .catch(() => {
        if (!c.signal.aborted) setQuoteError(true);
      });
    return () => c.abort();
  }, [category, quoteAttempt]);
  useEffect(() => {
    const id = localStorage.getItem('raasta-ride');
    if (id)
      api<Ride>(`/rides/${id}`)
        .then(setRide)
        .catch(() =>
          setError('Your previous ride could not be loaded. Refresh to retry.'),
        );
  }, []);
  useEffect(() => {
    if (!ride || terminal) return;
    return watchRide(ride.id, next => { applyRide(next); setError(''); }, setLiveStatus);
  }, [ride?.id, terminal, applyRide]);
  useEffect(() => {
    if (ride?.status === 'REQUESTED')
      api<Driver[]>('/drivers')
        .then(setDrivers)
        .catch(() =>
          setError('Drivers could not be loaded. Refresh to retry.'),
        );
  }, [ride?.id, ride?.status]);
  async function book(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const input = {
      riderId: RIDER,
      pickup: pickup.trim(),
      destination: destination.trim(),
      category,
    };
    const fingerprint = JSON.stringify(input);
    if (pendingRide.current?.fingerprint !== fingerprint)
      pendingRide.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const next = await api<Ride>(`/rides/${pendingRide.current.id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      setRide(next);
      localStorage.setItem('raasta-ride', next.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Booking failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, driverId?: string) {
    if (!ride || busy) return;
    setBusy(true);
    setError('');
    try {
      applyRide(
        await api<Ride>(`/rides/${ride.id}/${name}`, {
          method: 'POST',
          body: JSON.stringify(driverId ? { driverId } : {}),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Action failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshRide() {
    if (!ride || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      const next = await api<Ride>(`/rides/${ride.id}`);
      applyRide(next);
      if (next.status === 'REQUESTED') setDrivers(await api<Driver[]>('/drivers'));
    } catch {
      setError('Could not refresh the ride. Please try again.');
    } finally { setRefreshing(false); }
  }
  function reset() {
    setRide(null);
    setError('');
    pendingRide.current = null;
    localStorage.removeItem('raasta-ride');
  }
  return {
    pickup,
    setPickup,
    destination,
    setDestination,
    category,
    setCategory,
    ride,
    quote,
    drivers,
    busy,
    liveStatus,
    refreshing,
    refreshRide,
    error,
    quoteError,
    setQuoteAttempt,
    book,
    action,
    terminal,
    reset,
  };
}
