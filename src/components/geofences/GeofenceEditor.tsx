"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import "@/lib/map/setup";
import { LocateFixed, Search } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { useTheme } from "@/components/shell/ThemeProvider";
import { DARK_STYLE, DEFAULT_VIEW, LABEL_FONT, LIGHT_STYLE } from "@/lib/map/styles";
import { bbox, circlePolygon } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Draft {
  id: string | null;
  name: string;
  color: string;
  address: string | null;
  kind: "circle" | "polygon";
  center: { lat: number; lng: number } | null;
  radius_m: number;
  ring: [number, number][];
}

interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0891b2"];

/**
 * Map with the existing places plus a draft being created or edited.
 * Three ways to position a circle: search an address, use the device's location, or click the map.
 * Polygon: click to add vertices, Undo to remove.
 */
export function GeofenceEditor({ draft, onChange, onCancel, onSave, saving }: { draft: Draft | null; onChange: (d: Draft) => void; onCancel: () => void; onSave: (d: Draft) => void; saving: boolean }) {
  const { geofences, assetList } = useAssetStore();
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fitted = useRef(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded || fitted.current) return;
    const pts = [
      ...assetList.filter((a) => a.latitude != null).map((a) => ({ lng: a.longitude!, lat: a.latitude! })),
      ...geofences.flatMap((g) => g.geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }))),
    ];
    const b = bbox(pts);
    if (b) {
      fitted.current = true;
      mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }, [loaded, assetList, geofences]);

  const placeCentre = useCallback(
    (lat: number, lng: number, address: string | null) => {
      if (!draft) return;
      onChange({ ...draft, kind: "circle", center: { lat, lng }, address });
      mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 600 });
    },
    [draft, onChange],
  );

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { results?: GeocodeHit[]; error?: string };
      if (!res.ok) {
        setGeoError(json.error === "rate_limited" ? "Too many searches, wait a minute." : "Address search is unavailable right now.");
        setHits(null);
      } else {
        setHits(json.results ?? []);
      }
    } catch {
      setGeoError("Address search failed.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("This browser cannot report your location.");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => placeCentre(pos.coords.latitude, pos.coords.longitude, null),
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission denied for this site." : "Could not get your location."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  }, [placeCentre]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!draft) return;
      const { lng, lat } = e.lngLat;
      if (draft.kind === "circle") onChange({ ...draft, center: { lng, lat }, address: draft.center ? draft.address : null });
      else if (draft.ring.length < 200) onChange({ ...draft, ring: [...draft.ring, [lng, lat]] });
    },
    [draft, onChange],
  );

  const existing = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: geofences.filter((g) => g.id !== draft?.id).map((g) => ({ type: "Feature", geometry: g.geometry, properties: { name: g.name, color: g.color ?? "#2563eb" } })),
    }),
    [geofences, draft?.id],
  );

  const draftGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!draft) return { type: "FeatureCollection", features: [] };
    const features: GeoJSON.Feature[] = [];
    if (draft.kind === "circle" && draft.center) {
      features.push({ type: "Feature", geometry: circlePolygon(draft.center, draft.radius_m), properties: { color: draft.color, kind: "area" } });
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [draft.center.lng, draft.center.lat] }, properties: { color: draft.color, kind: "vertex" } });
    }
    if (draft.kind === "polygon") {
      if (draft.ring.length >= 3) features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...draft.ring, draft.ring[0]]] }, properties: { color: draft.color, kind: "area" } });
      else if (draft.ring.length === 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: draft.ring }, properties: { color: draft.color, kind: "line" } });
      for (const p of draft.ring) features.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { color: draft.color, kind: "vertex" } });
    }
    return { type: "FeatureCollection", features };
  }, [draft]);

  const assetsGeo = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: assetList.filter((a) => a.latitude != null).map((a) => ({ type: "Feature", geometry: { type: "Point", coordinates: [a.longitude!, a.latitude!] }, properties: { name: a.name } })),
    }),
    [assetList],
  );

  const valid = draft && draft.name.trim().length > 0 && (draft.kind === "circle" ? Boolean(draft.center) : draft.ring.length >= 3);

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        initialViewState={DEFAULT_VIEW}
        mapStyle={theme === "dark" ? DARK_STYLE : LIGHT_STYLE}
        onLoad={() => setLoaded(true)}
        onClick={onClick}
        cursor={draft ? "crosshair" : "grab"}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="existing" type="geojson" data={existing}>
          <Layer id="existing-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.08 }} />
          <Layer id="existing-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [3, 2] }} />
          <Layer id="existing-label" type="symbol" layout={{ "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 11 }} paint={{ "text-color": ["get", "color"], "text-halo-color": theme === "dark" ? "#0b0f17" : "#ffffff", "text-halo-width": 1.5 }} />
        </Source>
        <Source id="assets-simple" type="geojson" data={assetsGeo}>
          <Layer id="assets-simple-dot" type="circle" paint={{ "circle-radius": 5, "circle-color": "#0f172a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 }} />
          <Layer id="assets-simple-label" type="symbol" layout={{ "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 11, "text-offset": [0, 1], "text-anchor": "top" }} paint={{ "text-color": theme === "dark" ? "#e5e9f0" : "#0f172a", "text-halo-color": theme === "dark" ? "#0b0f17" : "#ffffff", "text-halo-width": 1.5 }} />
        </Source>
        <Source id="draft" type="geojson" data={draftGeo}>
          <Layer id="draft-fill" type="fill" filter={["==", ["get", "kind"], "area"]} paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.2 }} />
          <Layer id="draft-outline" type="line" filter={["any", ["==", ["get", "kind"], "area"], ["==", ["get", "kind"], "line"]]} paint={{ "line-color": ["get", "color"], "line-width": 2.5 }} />
          <Layer id="draft-vertex" type="circle" filter={["==", ["get", "kind"], "vertex"]} paint={{ "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2 }} />
        </Source>
      </Map>

      {draft ? (
        <div className="absolute left-3 top-3 max-h-[calc(100%-24px)] w-[calc(100%-24px)] max-w-sm space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
          <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Name (Home, Office, Vet…)" maxLength={60} aria-label="Place name" />

          {draft.kind === "circle" ? (
            <div className="space-y-2">
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Explicit so Enter / mobile "Go" always searches, independent of implicit form submission.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void search();
                    }
                  }}
                  placeholder="Search an address or landmark"
                  aria-label="Address"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={searching || query.trim().length < 3} aria-label="Search address" className="h-9 shrink-0">
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </form>
              {hits ? (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
                  {hits.length === 0 ? <li className="p-2 text-muted">No matches. Try adding the area or city.</li> : null}
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left hover:bg-surface-2"
                        onClick={() => {
                          placeCentre(h.lat, h.lng, h.label);
                          setHits(null);
                          setQuery("");
                        }}
                      >
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={useMyLocation}>
                  <LocateFixed className="h-3.5 w-3.5" /> Use my location
                </Button>
                <span className="text-[11px] text-muted">or click the map</span>
              </div>
              {draft.address ? <p className="truncate text-[11px] text-muted" title={draft.address}>{draft.address}</p> : null}
              {geoError ? <p className="text-[11px] text-danger">{geoError}</p> : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              {(["circle", "polygon"] as const).map((k) => (
                <button key={k} type="button" onClick={() => onChange({ ...draft, kind: k })} className={`rounded-md px-3 py-1 font-medium ${draft.kind === k ? "bg-accent text-accent-foreground" : "text-muted"}`}>
                  {k === "circle" ? "Circle" : "Polygon"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => onChange({ ...draft, color: c })} className={`h-6 w-6 rounded-full border-2 ${draft.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          {draft.kind === "circle" ? (
            <div>
              <label className="flex justify-between text-xs text-muted">
                <span>{draft.center ? "Radius" : "Place the centre first"}</span>
                <span>{draft.radius_m} m</span>
              </label>
              <input type="range" min={20} max={5000} step={10} value={draft.radius_m} onChange={(e) => onChange({ ...draft, radius_m: Number(e.target.value) })} className="w-full" aria-label="Radius in metres" />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{draft.ring.length < 3 ? `Click to add points (${draft.ring.length}/3 minimum)` : `${draft.ring.length} points`}</span>
              <Button size="sm" variant="ghost" disabled={draft.ring.length === 0} onClick={() => onChange({ ...draft, ring: draft.ring.slice(0, -1) })}>
                Undo
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={!valid || saving} onClick={() => onSave(draft)}>
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create place"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
