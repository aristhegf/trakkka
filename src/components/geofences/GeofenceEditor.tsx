"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import "@/lib/map/setup";
import { LocateFixed, MapPin, Search, Undo2, X } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { useResolvedTheme } from "@/components/kit/theme";
import { useIsPhone } from "@/components/kit/media";
import { DARK_STYLE, DEFAULT_VIEW, LABEL_FONT, LIGHT_STYLE } from "@/lib/map/styles";
import { MAP_PALETTE } from "@/lib/map/icons";
import { bbox, circlePolygon } from "@/lib/geo";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { RangeSlider } from "@/components/motion/range-slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { FieldLabel } from "@/components/kit/form";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export const PLACE_COLORS = ["#4b3bf0", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#db2777"];
const RADIUS_PRESETS = [100, 250, 500, 1000];

/**
 * Map with the existing places plus a draft being created or edited.
 * Three ways to position a circle: search an address, use the device's location, or tap the map.
 * Drawn area: tap to add corners, Undo to remove.
 * On phones the editor takes the whole screen (map on top, form in a bottom panel) so the map is big enough to tap.
 */
export function GeofenceEditor({ draft, onChange, onCancel, onSave, saving, className }: { draft: Draft | null; onChange: (d: Draft) => void; onCancel: () => void; onSave: (d: Draft) => void; saving: boolean; className?: string }) {
  const { geofences, assetList } = useAssetStore();
  const theme = useResolvedTheme();
  const isPhone = useIsPhone();
  const palette = MAP_PALETTE[theme];
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fitted = useRef(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!loaded || fitted.current) return;
    const pts = [
      ...assetList.filter((a) => a.latitude != null).map((a) => ({ lng: a.longitude!, lat: a.latitude! })),
      ...geofences.flatMap((g) => g.geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }))),
    ];
    const b = bbox(pts);
    if (b) {
      fitted.current = true;
      mapRef.current?.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
    }
  }, [loaded, assetList, geofences]);

  // The container changes size when the phone editor opens full screen.
  useEffect(() => {
    const id = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setGeoError(json.error === "rate_limited" ? "Too many searches. Wait a minute and try again." : "Address search is unavailable right now.");
        setHits(null);
      } else {
        setHits(json.results ?? []);
      }
    } catch {
      setGeoError("Address search failed. Check your connection.");
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
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        placeCentre(pos.coords.latitude, pos.coords.longitude, null);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is blocked for this site." : "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  }, [placeCentre]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!draft) return;
      const { lng, lat } = e.lngLat;
      if (draft.kind === "circle") onChange({ ...draft, center: { lng, lat }, address: null });
      else if (draft.ring.length < 200) onChange({ ...draft, ring: [...draft.ring, [lng, lat]] });
    },
    [draft, onChange],
  );

  const existing = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: geofences.filter((g) => g.id !== draft?.id).map((g) => ({ type: "Feature", geometry: g.geometry, properties: { name: g.name, color: g.color ?? PLACE_COLORS[0] } })),
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
  const hint = !draft ? null : draft.kind === "circle" ? (draft.center ? "Tap the map to move the centre." : "Search, use your location, or tap the map.") : draft.ring.length < 3 ? `Tap the map to add corners (${draft.ring.length} of at least 3).` : `${draft.ring.length} corners. Keep tapping to add more.`;

  return (
    <div className={cn("relative h-full w-full", draft && "max-md:fixed max-md:inset-0 max-md:z-[60] max-md:bg-background", className)}>
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
        {!isPhone ? <NavigationControl position="top-right" showCompass={false} /> : null}
        <Source id="existing" type="geojson" data={existing}>
          <Layer id="existing-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.1 }} />
          <Layer id="existing-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [3, 2] }} />
          <Layer id="existing-label" type="symbol" layout={{ "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 12 }} paint={{ "text-color": ["get", "color"], "text-halo-color": palette.paper, "text-halo-width": 1.5 }} />
        </Source>
        <Source id="assets-simple" type="geojson" data={assetsGeo}>
          <Layer id="assets-simple-dot" type="circle" paint={{ "circle-radius": 6, "circle-color": palette.ink, "circle-stroke-color": palette.paper, "circle-stroke-width": 2 }} />
          <Layer id="assets-simple-label" type="symbol" layout={{ "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 11, "text-offset": [0, 1], "text-anchor": "top" }} paint={{ "text-color": palette.ink, "text-halo-color": palette.paper, "text-halo-width": 1.5 }} />
        </Source>
        <Source id="draft" type="geojson" data={draftGeo}>
          <Layer id="draft-fill" type="fill" filter={["==", ["get", "kind"], "area"]} paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.22 }} />
          <Layer id="draft-outline" type="line" filter={["any", ["==", ["get", "kind"], "area"], ["==", ["get", "kind"], "line"]]} paint={{ "line-color": ["get", "color"], "line-width": 2.5 }} />
          <Layer id="draft-vertex" type="circle" filter={["==", ["get", "kind"], "vertex"]} paint={{ "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2.5 }} />
        </Source>
      </Map>

      {draft && hint ? (
        <div className="pointer-events-none absolute inset-x-3 z-10 top-[max(0.75rem,env(safe-area-inset-top))] flex justify-center md:left-auto md:right-14 md:top-3 md:justify-end">
          <p className="rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur">{hint}</p>
        </div>
      ) : null}

      {draft ? (
        <div
          className={cn(
            "absolute z-10 overflow-y-auto border border-border bg-card shadow-2xl scroll-thin",
            "inset-x-0 bottom-0 max-h-[58%] rounded-t-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
            "md:inset-x-auto md:bottom-auto md:left-4 md:top-4 md:max-h-[calc(100%-2rem)] md:w-[360px] md:rounded-3xl md:p-4",
          )}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{draft.id ? "Edit place" : "New place"}</h2>
            <button type="button" onClick={onCancel} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Input label="Name" value={draft.name} onChange={(v) => onChange({ ...draft, name: v })} placeholder="Home, Office, School…" maxLength={60} />

            <Tabs value={draft.kind} onValueChange={(v) => onChange({ ...draft, kind: v as Draft["kind"] })} variant="segment">
              <TabsList className="grid w-full grid-cols-2 bg-muted p-1">
                <TabsTrigger value="circle" className="h-11 w-full">
                  Around a point
                </TabsTrigger>
                <TabsTrigger value="polygon" className="h-11 w-full">
                  Draw an area
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {draft.kind === "circle" ? (
              <div className="space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search();
                  }}
                >
                  <Input
                    label="Address"
                    value={query}
                    onChange={setQuery}
                    enterKeyHint="search"
                    placeholder="Street, area or landmark"
                    leftIcon={<MapPin />}
                    rightIcon={
                      <button type="submit" aria-label="Search address" disabled={searching || query.trim().length < 3} className="text-foreground disabled:text-muted-foreground">
                        <Search />
                      </button>
                    }
                  />
                </form>
                {searching ? <p className="px-1 text-xs text-muted-foreground">Searching…</p> : null}
                {hits ? (
                  <ul className="overflow-hidden rounded-2xl border border-border">
                    {hits.length === 0 ? <li className="px-3.5 py-3 text-sm text-muted-foreground">No matches. Try adding the area or city.</li> : null}
                    {hits.map((h, i) => (
                      <li key={i} className="border-b border-border last:border-0">
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            placeCentre(h.lat, h.lng, h.label);
                            setHits(null);
                            setQuery("");
                          }}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          {h.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button type="button" variant="secondary" className="w-full" disabled={locating} onClick={useMyLocation}>
                  <LocateFixed className="h-4 w-4" /> {locating ? "Finding you…" : "Use my current location"}
                </Button>
                {draft.address ? <p className="rounded-2xl bg-muted/60 px-3.5 py-2.5 text-xs text-muted-foreground">{draft.address}</p> : null}
                {geoError ? <p className="px-1 text-xs text-destructive">{geoError}</p> : null}

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between px-1">
                    <FieldLabel>Size</FieldLabel>
                    <span className="text-sm font-semibold tabular-nums">{formatDistance(draft.radius_m)}</span>
                  </div>
                  <RangeSlider min={20} max={5000} step={10} value={draft.radius_m} onValueChange={(v) => onChange({ ...draft, radius_m: v })} showTicks={false} formatValueText={(v) => `${v} metres`} />
                  <div className="flex gap-1.5">
                    {RADIUS_PRESETS.map((r) => (
                      <button key={r} type="button" onClick={() => onChange({ ...draft, radius_m: r })} className={cn("h-11 flex-1 rounded-full border text-xs font-medium transition-colors", draft.radius_m === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                        {formatDistance(r)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Button type="button" variant="secondary" className="w-full" disabled={draft.ring.length === 0} onClick={() => onChange({ ...draft, ring: draft.ring.slice(0, -1) })}>
                <Undo2 className="h-4 w-4" /> Remove last corner
              </Button>
            )}

            <div className="space-y-2">
              <FieldLabel>Colour</FieldLabel>
              <div className="flex gap-2 px-1">
                {PLACE_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={draft.color === c} onClick={() => onChange({ ...draft, color: c })} className={cn("h-11 w-11 rounded-full ring-offset-2 ring-offset-card transition-shadow", draft.color === c && "ring-2 ring-foreground")} style={{ background: c }} />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!valid || saving} onClick={() => onSave(draft)}>
                {saving ? "Saving…" : draft.id ? "Save" : "Save place"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
