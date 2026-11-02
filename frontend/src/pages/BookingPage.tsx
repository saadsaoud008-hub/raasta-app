import { CircleHelp, ShieldCheck, Star } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { IllustrativeMap } from '../components/IllustrativeMap';
import { BookingCard } from '../features/rides/components/BookingCard';
import { useRideBooking } from '../features/rides/useRideBooking';
export function BookingPage() {
  const booking = useRideBooking();
  return (
    <div className="app-shell">
      <Header />
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">
              <span /> MADE FOR YOUR EVERYDAY
            </p>
            <h1>Your city. Your next stop.</h1>
            <p className="subtitle">
              A better way to get around Lahore. Where are we headed?
            </p>
          </div>
          <div className="intro-note">
            <ShieldCheck size={19} />
            <span>
              A little more peace of mind.
              <br />
              <strong>Every step of the way.</strong>
            </span>
          </div>
        </div>
        <div className="booking-layout">
          <BookingCard booking={booking} />
          <IllustrativeMap />
        </div>
        <section className="benefits" aria-label="Ride benefits">
          <div>
            <span>
              <ShieldCheck />
            </span>
            <section>
              <h3>A safer way to move</h3>
              <p>Driver and vehicle details with your ride.</p>
            </section>
          </div>
          <div>
            <span>
              <Star />
            </span>
            <section>
              <h3>Everyday, made easier</h3>
              <p>Simple fares. Comfortable journeys.</p>
            </section>
          </div>
          <div>
            <span>
              <CircleHelp />
            </span>
            <section>
              <h3>Here for the journey</h3>
              <p>Clear updates from request to arrival.</p>
            </section>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
