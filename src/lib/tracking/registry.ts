import type { ProviderKey } from "@/lib/types";
import type { TrackingProvider } from "./types";
import {
  appleFindMyReportedProvider,
  browserGeolocationProvider,
  iosCompanionProvider,
  manualProvider,
  simulatedProvider,
} from "./providers/generic";
import { traccarProvider } from "./providers/traccar";

const PROVIDERS: Record<ProviderKey, TrackingProvider | undefined> = {
  simulated: simulatedProvider,
  manual: manualProvider,
  browser_geolocation: browserGeolocationProvider,
  ios_companion: iosCompanionProvider,
  traccar: traccarProvider,
  flespi: undefined, // P3: webhook adapter, same NormalizedLocation contract
  apple_findmy_reported: appleFindMyReportedProvider,
};

export function getProvider(key: string): TrackingProvider | undefined {
  return PROVIDERS[key as ProviderKey];
}

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

/** Which providers a user can pick when creating an asset of a given type. */
export function providerOptionsFor(type: "device" | "pet" | "vehicle" | "other"): ProviderKey[] {
  switch (type) {
    case "vehicle":
      return ["simulated", "traccar", "manual"];
    case "pet":
      return ["simulated", "traccar", "apple_findmy_reported", "manual"];
    case "device":
      return ["browser_geolocation", "apple_findmy_reported", "simulated", "manual"];
    default:
      return ["simulated", "manual", "apple_findmy_reported"];
  }
}

export const PROVIDER_HELP: Record<ProviderKey, string> = {
  simulated: "Fake tracker for testing. Drive it with the simulator script.",
  manual: "You enter the location yourself. Never shown as live.",
  browser_geolocation: "This browser reports its own position while Trakkka is open. Foreground only.",
  ios_companion: "Trakkka iOS app (coming later). Background location with your consent.",
  traccar: "A GPS tracker reporting to your Traccar server, forwarded here.",
  flespi: "A GPS tracker on flespi, forwarded here (coming later).",
  apple_findmy_reported:
    "Apple offers no API for AirTag or Find My locations. Record a check-in by hand and open Find My for the live view.",
};
