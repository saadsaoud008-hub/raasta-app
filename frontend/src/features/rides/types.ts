export type Category = 'ECONOMY' | 'COMFORT';
export interface Ride {
  id: string;
  pickup: string;
  destination: string;
  category: Category;
  status: 'REQUESTED' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED';
  fare_paisa: number;
  eta_minutes: number;
  driver_id: string | null;
  driver_name: string | null;
  vehicle: string | null;
  plate: string | null;
  updated_at?: string;
}
export interface Driver {
  id: string;
  name: string;
  category: Category;
  available: boolean;
  vehicle: string;
  plate: string;
}
