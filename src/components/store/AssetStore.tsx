"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Alert, AssetOverview, AssetStateRecord, Geofence, TrackingProviderRow } from "@/lib/types";
import { deriveFreshness, thresholdsFrom } from "@/lib/freshness";

interface State {
  assets: Record<string, AssetOverview>;
  alerts: Alert[];
  geofences: Geofence[];
  providers: Record<string, TrackingProviderRow>;
  connected: boolean;
  lastEventAt: number | null;
}

type Action =
  | { type: "state"; record: AssetStateRecord }
  | { type: "alert"; alert: Alert }
  | { type: "geofence_asset"; geofenceId: string; assetId: string; isInside: boolean | null; at: string | null }
  | { type: "connected"; value: boolean }
  | { type: "reset"; assets: AssetOverview[]; alerts: Alert[]; geofences: Geofence[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "state": {
      const r = action.record;
      const existing = state.assets[r.asset_id];
      if (!existing) return state; // unknown asset (created elsewhere); a refresh will pick it up
      // Never let an older event overwrite a newer displayed location.
      if (existing.last_location_at && r.last_location_at && Date.parse(r.last_location_at) < Date.parse(existing.last_location_at)) {
        return state;
      }
      return {
        ...state,
        lastEventAt: Date.now(),
        assets: {
          ...state.assets,
          [r.asset_id]: {
            ...existing,
            latitude: r.latitude,
            longitude: r.longitude,
            accuracy_m: r.accuracy_m,
            altitude_m: r.altitude_m,
            speed_mps: r.speed_mps,
            heading_deg: r.heading_deg,
            battery_level: r.battery_level,
            battery_updated_at: r.battery_updated_at,
            connection_status: r.connection_status,
            connection_updated_at: r.connection_updated_at,
            movement_state: r.movement_state,
            last_location_at: r.last_location_at,
            last_received_at: r.last_received_at,
            last_source: r.last_source,
            place_label: r.place_label,
          },
        },
      };
    }
    case "alert": {
      const idx = state.alerts.findIndex((a) => a.id === action.alert.id);
      const alerts = idx >= 0 ? state.alerts.map((a) => (a.id === action.alert.id ? action.alert : a)) : [action.alert, ...state.alerts];
      const assets = { ...state.assets };
      if (action.alert.asset_id && assets[action.alert.asset_id]) {
        const open = alerts.filter((a) => a.asset_id === action.alert.asset_id && !a.acknowledged_at && !a.resolved_at).length;
        assets[action.alert.asset_id] = { ...assets[action.alert.asset_id], open_alert_count: open };
      }
      return { ...state, alerts: alerts.slice(0, 200), assets, lastEventAt: Date.now() };
    }
    case "geofence_asset":
      return {
        ...state,
        geofences: state.geofences.map((g) =>
          g.id !== action.geofenceId
            ? g
            : { ...g, assets: g.assets.map((l) => (l.asset_id === action.assetId ? { ...l, is_inside: action.isInside, last_transition_at: action.at } : l)) },
        ),
      };
    case "connected":
      return { ...state, connected: action.value };
    case "reset":
      return {
        ...state,
        assets: Object.fromEntries(action.assets.map((a) => [a.id, a])),
        alerts: action.alerts,
        geofences: action.geofences,
      };
    default:
      return state;
  }
}

interface AssetStoreValue extends State {
  now: Date;
  /** IANA timezone from the user's profile; used for every absolute timestamp so SSR and client agree. */
  timezone: string;
  assetList: AssetOverview[];
  freshnessOf: (a: AssetOverview) => ReturnType<typeof deriveFreshness>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AssetStoreValue | null>(null);

export function AssetStoreProvider({
  userId,
  initialAssets,
  initialAlerts,
  initialGeofences,
  providers,
  initialNow,
  timezone,
  children,
}: {
  userId: string;
  initialAssets: AssetOverview[];
  initialAlerts: Alert[];
  initialGeofences: Geofence[];
  providers: TrackingProviderRow[];
  /** Server render time (ms). Seeding the clock from it keeps "x s ago" identical during hydration. */
  initialNow: number;
  timezone: string;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    assets: Object.fromEntries(initialAssets.map((a) => [a.id, a])),
    alerts: initialAlerts,
    geofences: initialGeofences,
    providers: Object.fromEntries(providers.map((p) => [p.key, p])),
    connected: false,
    lastEventAt: null,
  }));
  const [now, setNow] = useState(() => new Date(initialNow));
  const supabase = useMemo(() => createClient(), []);
  const initialRef = useRef({ initialAssets, initialAlerts, initialGeofences });

  // Server-rendered props change after router.refresh(); adopt them.
  useEffect(() => {
    if (
      initialRef.current.initialAssets !== initialAssets ||
      initialRef.current.initialAlerts !== initialAlerts ||
      initialRef.current.initialGeofences !== initialGeofences
    ) {
      initialRef.current = { initialAssets, initialAlerts, initialGeofences };
      dispatch({ type: "reset", assets: initialAssets, alerts: initialAlerts, geofences: initialGeofences });
    }
  }, [initialAssets, initialAlerts, initialGeofences]);

  // 1 s tick so freshness badges and "x s ago" labels stay honest without any server event.
  // The first tick runs right after mount (from a callback, so hydration has already matched).
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const refresh = useCallback(async () => {
    const [{ data: assets }, { data: alerts }, { data: geofences }] = await Promise.all([
      supabase.from("asset_overview").select("*").order("name"),
      supabase.from("alerts").select("*").is("resolved_at", null).order("triggered_at", { ascending: false }).limit(100),
      supabase.rpc("get_geofences_geojson"),
    ]);
    dispatch({
      type: "reset",
      assets: (assets ?? []) as AssetOverview[],
      alerts: (alerts ?? []) as Alert[],
      geofences: (geofences ?? []) as Geofence[],
    });
  }, [supabase]);

  // One private channel per user; the database broadcasts asset_state / alert / geofence_asset events.
  useEffect(() => {
    const channel = supabase
      .channel(`owner:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "asset_state" }, ({ payload }) => {
        const rec = (payload?.record ?? payload?.new) as AssetStateRecord | undefined;
        if (rec) dispatch({ type: "state", record: rec });
      })
      .on("broadcast", { event: "alert" }, ({ payload }) => {
        const rec = (payload?.record ?? payload?.new) as Alert | undefined;
        if (rec) dispatch({ type: "alert", alert: rec });
      })
      .on("broadcast", { event: "geofence_asset" }, ({ payload }) => {
        const rec = (payload?.record ?? payload?.new) as { geofence_id: string; asset_id: string; is_inside: boolean | null; last_transition_at: string | null } | undefined;
        if (rec) dispatch({ type: "geofence_asset", geofenceId: rec.geofence_id, assetId: rec.asset_id, isInside: rec.is_inside, at: rec.last_transition_at });
      })
      .subscribe((status) => {
        dispatch({ type: "connected", value: status === "SUBSCRIBED" });
        // After a reconnect we may have missed events; reload the snapshot.
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh]);

  const value = useMemo<AssetStoreValue>(() => {
    const assetList = Object.values(state.assets).sort((a, b) => a.name.localeCompare(b.name));
    return {
      ...state,
      now,
      timezone,
      assetList,
      freshnessOf: (a) => deriveFreshness(a.last_location_at, a.connection_status, thresholdsFrom(a), now),
      refresh,
    };
  }, [state, now, timezone, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssetStore(): AssetStoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssetStore must be used inside AssetStoreProvider");
  return v;
}
