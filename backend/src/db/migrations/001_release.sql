CREATE TABLE riders (
  id uuid PRIMARY KEY, name text NOT NULL,
  email text CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254)
);
CREATE TABLE drivers (
  id uuid PRIMARY KEY, name text NOT NULL,
  category text NOT NULL CHECK (category IN ('ECONOMY','COMFORT')),
  available boolean NOT NULL DEFAULT true, vehicle text NOT NULL, plate text NOT NULL UNIQUE
);
CREATE TABLE rides (
  id uuid PRIMARY KEY, rider_id uuid NOT NULL REFERENCES riders(id),
  pickup text NOT NULL CHECK (length(trim(pickup)) BETWEEN 2 AND 200),
  destination text NOT NULL CHECK (length(trim(destination)) BETWEEN 2 AND 200),
  category text NOT NULL CHECK (category IN ('ECONOMY','COMFORT')),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ACCEPTED','CANCELLED','COMPLETED')),
  driver_id uuid REFERENCES drivers(id),
  fare_paisa integer NOT NULL CHECK (fare_paisa > 0),
  eta_minutes integer NOT NULL CHECK (eta_minutes > 0),
  idempotency_key uuid, request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rider_id,idempotency_key),
  CHECK (status NOT IN ('ACCEPTED','COMPLETED') OR driver_id IS NOT NULL),
  CHECK (status <> 'REQUESTED' OR driver_id IS NULL)
);
CREATE UNIQUE INDEX one_active_ride_per_driver ON rides(driver_id) WHERE status='ACCEPTED';
CREATE UNIQUE INDEX one_active_ride_per_rider ON rides(rider_id) WHERE status IN ('REQUESTED','ACCEPTED');
CREATE INDEX available_drivers ON drivers(category,id) WHERE available;
