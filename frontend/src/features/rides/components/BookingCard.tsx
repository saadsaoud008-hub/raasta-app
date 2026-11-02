import {
  ArrowDown,
  ArrowRight,
  CarFront,
  Check,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { money } from '../../../lib/format';
import type { useRideBooking } from '../useRideBooking';
const places = [
  'Gulberg III, Lahore',
  'DHA Phase 5, Lahore',
  'Liberty Market, Lahore',
  'Johar Town, Lahore',
  'Allama Iqbal Airport, Lahore',
  'Model Town, Lahore',
];
export function BookingCard({
  booking,
}: {
  booking: ReturnType<typeof useRideBooking>;
}) {
  const {
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
  } = booking;
  return (
    <section className="booking-card" aria-label="Book your ride">
      <div className="card-heading">
        <span className="step-label">LET'S GET YOU THERE</span>
        <span className="small-badge">Lahore, PK</span>
      </div>
      {!ride ? (
        <form onSubmit={book}>
          <h2>Where to?</h2>
          <p className="muted">Your next ride starts here.</p>
          <div className="locations">
            <label className="location-field">
              <span className="pickup-dot" />
              <span>
                <span className="field-label">PICKUP LOCATION</span>
                <input
                  aria-label="Pickup location"
                  list="places"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup location"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </span>
            </label>
            <div className="location-divider" />
            <label className="location-field">
              <MapPin size={19} />
              <span>
                <span className="field-label">YOUR DESTINATION</span>
                <input
                  aria-label="Destination"
                  list="places"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Where do you want to go?"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </span>
            </label>
            <button
              className="swap"
              type="button"
              aria-label="Swap pickup and destination"
              onClick={() => {
                setPickup(destination);
                setDestination(pickup);
              }}
            >
              <ArrowDown size={15} />
            </button>
          </div>
          <datalist id="places">
            {places.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="section-label">
            CHOOSE YOUR RIDE <span>Two ways to make your way</span>
          </div>
          <div className="categories">
            {(['ECONOMY', 'COMFORT'] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`category ${category === c ? 'selected' : ''}`}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                <span className={`car-art ${c === 'COMFORT' ? 'comfort' : ''}`}>
                  <CarFront size={45} strokeWidth={1.4} />
                </span>
                <span className="category-name">
                  {c === 'ECONOMY' ? 'Economy' : 'Comfort'}
                  {c === 'COMFORT' && <Sparkles size={12} />}
                </span>
                <span className="category-caption">
                  {c === 'ECONOMY'
                    ? 'Easy on your pocket'
                    : 'A little extra comfort'}
                </span>
                <span className="category-bottom">
                  <span>{c === 'ECONOMY' ? '4' : '6'} min pickup</span>
                  <span className="radio">
                    {category === c && <Check size={11} />}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="fare-row">
            <div>
              <span className="muted">Estimated fare</span>
              <strong>
                {quote ? (
                  <>
                    <small>PKR</small> {money(quote.farePaisa)}
                  </>
                ) : (
                  'Unavailable'
                )}
              </strong>
            </div>
            <span className="estimate-chip">
              <Clock3 size={13} />
              {quote ? `${quote.etaMinutes} min away` : 'No estimate'}
            </span>
          </div>
          <p className="fare-note">
            Fixed demo estimate - Final fare shown before booking
          </p>
          {quoteError && (
            <div className="error" role="alert">
              Could not load fare estimates.{' '}
              <button
                type="button"
                className="retry"
                onClick={() => setQuoteAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary"
            disabled={busy || !pickup.trim() || !destination.trim() || !quote}
            type="submit"
          >
            {busy ? 'Requesting your ride...' : 'Request a ride'}
            <ArrowRight size={18} />
          </button>
          <p className="booking-footnote">
            <ShieldCheck size={13} /> Your ride, with a little reassurance.
          </p>
        </form>
      ) : (
        <div className="status-view">
          <div className="live-controls">
            <span role="status">
              {terminal ? 'Ride finished' : liveStatus === 'connected' ? 'Live updates connected' : liveStatus === 'connecting' ? 'Connecting live updates...' : 'Live updates disconnected. Refresh status anytime.'}
            </span>
            <button type="button" className="secondary" disabled={busy || refreshing} onClick={refreshRide}>
              {refreshing ? 'Refreshing...' : 'Refresh status'}
            </button>
          </div>
          <span className="status-icon">
            {terminal ? <Check /> : <CarFront />}
          </span>
          <h2>
            {ride.status === 'REQUESTED'
              ? 'Finding your next ride'
              : ride.status === 'ACCEPTED'
                ? 'Your driver is on the way'
                : ride.status === 'COMPLETED'
                  ? "You've arrived."
                  : 'Ride cancelled'}
          </h2>
          <p className="muted" role="status">
            {ride.status === 'REQUESTED'
              ? 'Your request is ready for a driver to accept.'
              : ride.status === 'ACCEPTED'
                ? `${ride.driver_name} - ${ride.eta_minutes} min estimated pickup`
                : "Book again whenever you're ready."}
          </p>
          <div className="trip-summary">
            <p>
              <span className="pickup-dot" />
              {ride.pickup}
            </p>
            <p>
              <MapPin size={16} />
              {ride.destination}
            </p>
            <div>
              <strong>PKR {money(ride.fare_paisa)}</strong>
              <span>{ride.category.toLowerCase()}</span>
            </div>
          </div>
          {ride.driver_name && (
            <div className="driver-card">
              <span className="avatar">{ride.driver_name[0]}</span>
              <div>
                <strong>{ride.driver_name}</strong>
                <p>
                  {ride.vehicle} - {ride.plate}
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {!terminal && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => action('cancel')}
            >
              <X size={15} />
              Cancel ride
            </button>
          )}
          {terminal && (
            <button className="primary" onClick={reset}>
              Book another ride
              <ArrowRight size={18} />
            </button>
          )}
          {!terminal && (
            <details className="demo-panel">
              <summary>Demo driver controls</summary>
              <p>Use these controls to demonstrate the ride lifecycle.</p>
              {ride.status === 'REQUESTED' ? (
                <>
                  <p>
                    {drivers.filter(
                      (d) => d.available && d.category === ride.category,
                    ).length
                      ? 'Choose an available driver:'
                      : 'No eligible drivers available. You can cancel this request.'}
                  </p>
                  {drivers
                    .filter((d) => d.available && d.category === ride.category)
                    .map((d) => (
                      <button
                        className="secondary full"
                        disabled={busy}
                        key={d.id}
                        onClick={() => action('accept', d.id)}
                      >
                        Accept as {d.name}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                </>
              ) : (
                <button
                  className="secondary full"
                  disabled={busy}
                  onClick={() => action('complete')}
                >
                  Complete ride
                  <Check size={15} />
                </button>
              )}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
