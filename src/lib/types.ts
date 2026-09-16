export type AssetType = "device" | "pet" | "vehicle" | "other";
export type AssetStatus = "active" | "archived" | "lost";
export type ConnectionStatus = "online" | "offline" | "unknown";
export type MovementState = "moving" | "stationary" | "unknown";
export type Freshness = "live" | "recent" | "stale" | "offline" | "unknown";
export type ProviderKind = "push_webhook" | "poll" | "client_reported" | "manual";
export type ProviderKey =
  | "simulated"
  | "manual"
  | "browser_geolocation"
  | "ios_companion"
  | "traccar"
  | "flespi"
  | "traccar_client"
  | "owntracks"
  | "apple_findmy_reported";
export type AlertType =
  | "geofence_enter"
  | "geofence_exit"
  | "battery_low"
  | "battery_critical"
  | "tracker_offline"
  | "no_report"
  | "speed_limit"
  | "unexpected_movement"
  | "location_unavailable";
export type AlertSeverity = "info" | "warning" | "critical";

export interface ProviderCapabilities {
  battery?: boolean;
  speed?: boolean;
  heading?: boolean;
  accuracy?: boolean;
  ignition?: boolean;
  history?: boolean;
  connection?: boolean;
}

export interface TrackingProviderRow {
  key: ProviderKey;
  name: string;
  kind: ProviderKind;
  capabilities: ProviderCapabilities;
  live_after_s: number;
  recent_after_s: number;
  stale_after_s: number;
  offline_after_s: number;
  min_sample_interval_s: number;
  is_active: boolean;
}

/** Row of the `asset_overview` view: asset + current state + provider thresholds. */
export interface AssetOverview {
  id: string;
  owner_id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  photo_path: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  tracking_provider_key: ProviderKey | null;
  is_tracking_enabled: boolean;
  created_at: string;
  updated_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_level: number | null;
  battery_updated_at: string | null;
  connection_status: ConnectionStatus | null;
  connection_updated_at: string | null;
  movement_state: MovementState | null;
  last_location_at: string | null;
  last_received_at: string | null;
  last_source: string | null;
  place_label: string | null;
  live_after_s: number | null;
  recent_after_s: number | null;
  stale_after_s: number | null;
  offline_after_s: number | null;
  provider_kind: ProviderKind | null;
  provider_capabilities: ProviderCapabilities | null;
  age_seconds: number | null;
  open_alert_count: number;
}

/** Realtime payload for `asset_states` changes (subset that the UI patches). */
export interface AssetStateRecord {
  asset_id: string;
  owner_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_level: number | null;
  battery_updated_at: string | null;
  connection_status: ConnectionStatus;
  connection_updated_at: string | null;
  movement_state: MovementState;
  last_location_at: string | null;
  last_received_at: string | null;
  last_source: string | null;
  place_label: string | null;
  updated_at: string;
}

export interface PetProfile {
  asset_id: string;
  species: string | null;
  breed: string | null;
  sex: "male" | "female" | "unknown" | null;
  date_of_birth: string | null;
  microchip_id: string | null;
  weight_kg: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  notes: string | null;
}

export interface VehicleProfile {
  asset_id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_number: string | null;
  vin: string | null;
  color: string | null;
  fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | "unknown" | null;
  odometer_km: number | null;
  fuel_level_pct: number | null;
  ignition_on: boolean | null;
  speed_limit_kph: number | null;
}

export interface DeviceProfile {
  asset_id: string;
  device_type: "phone" | "tablet" | "laptop" | "watch" | "tracker" | "other" | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  os: string | null;
  os_version: string | null;
}

export interface AssetDevice {
  id: string;
  asset_id: string;
  provider_key: ProviderKey;
  external_device_id: string;
  tracker_model: string | null;
  status: "active" | "paused" | "error";
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  owner_id: string;
  asset_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface GeofenceAssetLink {
  asset_id: string;
  is_inside: boolean | null;
  notify_on_enter: boolean;
  notify_on_exit: boolean;
  last_transition_at: string | null;
}

export interface Geofence {
  id: string;
  name: string;
  kind: "circle" | "polygon";
  color: string | null;
  icon: string | null;
  is_active: boolean;
  radius_m: number | null;
  /** Human-readable address the user searched for or typed; null when placed by map click / GPS. */
  address: string | null;
  center: { lat: number; lng: number } | null;
  geometry: GeoJSON.Polygon;
  assets: GeofenceAssetLink[];
  created_at: string;
}

export interface HistoryPoint {
  id: number;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_level: number | null;
  source: string;
}

export interface HistoryStats {
  point_count: number;
  distance_m: number;
  moving_seconds: number;
  stopped_seconds: number;
  max_speed_mps: number | null;
  avg_moving_speed_mps: number | null;
  first_at: string | null;
  last_at: string | null;
}

export interface Stop {
  started_at: string;
  ended_at: string;
  duration_s: number;
  latitude: number;
  longitude: number;
}
