import { CarFront, Leaf, MapPin, Navigation } from 'lucide-react';
export function IllustrativeMap() {
  return (
    <section className="map-panel" aria-label="Illustrative Lahore map">
      <div className="map-top">
        <span>
          <span className="live-dot" /> YOUR CITY, CONNECTED
        </span>
        <span className="map-key">Illustrative map</span>
      </div>
      <div className="map-canvas">
        <div className="park park-one" />
        <div className="park park-two" />
        <div className="road road-one" />
        <div className="road road-two" />
        <div className="road road-three" />
        <div className="road road-four" />
        <span className="map-label label-one">GULBERG III</span>
        <span className="map-label label-two">LIBERTY MARKET</span>
        <span className="map-label label-three">MODEL TOWN</span>
        <span className="park-label">
          <Leaf size={12} /> Jilani Park
        </span>
        <svg
          className="route-line"
          viewBox="0 0 600 580"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M180 190 L280 190 Q300 190 300 215 L300 345 Q300 365 325 365 L425 365"
            fill="none"
            stroke="#255e4e"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="9 7"
          />
        </svg>
        <div className="map-pin pin-start">
          <span className="pin-tooltip">Your next adventure starts here</span>
          <Navigation size={21} fill="currentColor" />
        </div>
        <div className="map-pin pin-end">
          <MapPin size={21} />
        </div>
        <span className="map-car car-one">
          <CarFront size={20} />
        </span>
        <span className="map-car car-two">
          <CarFront size={20} />
        </span>
        <span className="map-car car-three">
          <CarFront size={20} />
        </span>
        <div className="map-city">
          Lahore<span>THE HEART OF PUNJAB</span>
        </div>
      </div>
      <div className="map-bottom">
        <span className="map-bottom-icon">
          <Leaf size={21} />
        </span>
        <div>
          <strong>Less hassle. More Lahore.</strong>
          <p>From your morning chai to your evening plans.</p>
        </div>
        <span className="map-compass">
          <Navigation size={18} />
        </span>
      </div>
    </section>
  );
}
