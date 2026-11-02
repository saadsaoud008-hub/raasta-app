import { Navigation, MapPin, ChevronDown } from 'lucide-react';
export function Header() {
  return (
    <header className="header">
      <a className="brand" href="/" aria-label="Raasta home">
        <span className="brand-mark">
          <Navigation size={21} fill="currentColor" />
        </span>
        raasta<span className="brand-dot">.</span>
      </a>
      <nav aria-label="Main navigation">
        <span className="nav-active">Book a ride</span>
        <span className="city-pill">
          <MapPin size={14} /> Lahore <ChevronDown size={13} />
        </span>
      </nav>
      <span className="profile">
        <span className="avatar">D</span> Demo rider
      </span>
    </header>
  );
}
