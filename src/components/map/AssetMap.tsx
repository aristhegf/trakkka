"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, ScaleControl, Source, type LayerProps, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { GeoJSONSource, SkySpecification } from "maplibre-gl";
import "@/lib/map/setup";
import { Box, Layers, LocateFixed, Map as MapIcon, Maximize2, Satellite } from "lucide-react";
import type { AssetOverview, AssetType, Freshness, Geofence, HistoryPoint } from "@/lib/types";
import { DARK_STYLE, DEFAULT_VIEW, LABEL_FONT, LIGHT_STYLE, SATELLITE_AVAILABLE, satelliteStyle } from "@/lib/map/styles";
import { MAP_PALETTE, iconId, registerAssetIcons } from "@/lib/map/icons";
import { bbox, circlePolygon, lerpLngLat, type LngLat } from "@/lib/geo";
import { useResolvedTheme } from "@/components/kit/theme";
import { Tooltip } from "@/components/motion/tooltip";
import { cn } from "@/lib/utils";
import { useStoredFlag } from "@/lib/use-stored-flag";

export interface AssetMapProps {
  assets: AssetOverview[];
  freshnessOf: (a: AssetOverview) => Freshness;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  geofences?: Geofence[];
  trail?: HistoryPoint[] | null;
  /** When set, the map centres on this asset id whenever it changes. */
  focusId?: string | null;
  className?: string;
  interactive?: boolean;
  /** full: zoom buttons + tools (desktop). compact: tools only, pinch to zoom (phones). none: static preview. */
  controls?: "full" | "compact" | "none";
  /** Positions the tool column, e.g. to sit above a bottom card on phones. */
  controlsClassName?: string;
  fitOnLoad?: boolean;
  /** Extra padding (px) kept clear when fitting, e.g. under floating panels. */
  fitPadding?: { top?: number; bottom?: number; left?: number; right?: number };
}

interface Anim {
  from: LngLat;
  to: LngLat;
  start: number;
}

const ANIM_MS = 900;

/** OpenMapTiles vector source used by the OpenFreeMap styles; it carries building heights. */
const BUILDING_SOURCE = "openmaptiles";
const PITCH_3D = 55;
const BEARING_3D = -17;

/** Atmosphere around the globe; fades out as you zoom into a city so streets stay crisp. */
const SKY: Record<"light" | "dark", SkySpecification> = {
  dark: {
    "sky-color": "#0b1a33",
    "horizon-color": "#1e3a5f",
    "fog-color": "#100f0d",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 12, 0],
  },
  light: {
    "sky-color": "#8ec5ff",
    "horizon-color": "#dbeafe",
    "fog-color": "#f5f3ee",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 12, 0],
  },
};

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const nowMs = () => performance.now();

function animatedPos(a: Anim, t: number): LngLat {
  const k = Math.min(1, Math.max(0, (t - a.start) / ANIM_MS));
  const e = 1 - (1 - k) * (1 - k);
  return lerpLngLat(a.from, a.to, e);
}

/**
 * The live map. One clustered GeoJSON source for assets, one for accuracy circles, one for places, one for the
 * optional trail. Markers animate between fixes only when the asset is LIVE.
 */
export function AssetMap({
  assets,
  freshnessOf,
  selectedId = null,
  onSelect,
  geofences = [],
  trail = null,
  focusId = null,
  className,
  interactive = true,
  controls = "full",
  controlsClassName,
  fitOnLoad = true,
  fitPadding,
}: AssetMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const theme = useResolvedTheme();
  const pal = MAP_PALETTE[theme];
  const [satellite, setSatellite] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [me, setMe] = useState<{ lng: number; lat: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const fittedRef = useRef(false);
  const [hasBuildings, setHasBuildings] = useState(false);
  // 3D (globe, tilt, buildings) is a per-browser preference, offered only on maps with tools; previews stay flat.
  const [stored3d, setStored3d] = useStoredFlag("trakkka-map-3d");
  const is3d = controls !== "none" && stored3d;
  const is3dRef = useRef(is3d);
  useEffect(() => {
    is3dRef.current = is3d;
  }, [is3d]);

  const baseStyle = useMemo(() => {
    if (satellite) return satelliteStyle() ?? (theme === "dark" ? DARK_STYLE : LIGHT_STYLE);
    return theme === "dark" ? DARK_STYLE : LIGHT_STYLE;
  }, [satellite, theme]);

  const located = useMemo(() => assets.filter((a) => a.latitude != null && a.longitude != null), [assets]);

  // ---- Movement animation (render-time diff starts animations; a rAF loop advances and retires them).
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [, setFrame] = useState(0);
  const [prevLocated, setPrevLocated] = useState(located);
  if (located !== prevLocated) {
    setPrevLocated(located);
    const prevById = new globalThis.Map(prevLocated.map((a) => [a.id, a] as const));
    const t = nowMs();
    let next: Record<string, Anim> | null = null;
    for (const a of located) {
      const prev = prevById.get(a.id);
      if (!prev || prev.longitude == null || prev.latitude == null) continue;
      const target = { lng: a.longitude!, lat: a.latitude! };
      const moved = Math.abs(prev.longitude - target.lng) > 1e-7 || Math.abs(prev.latitude - target.lat) > 1e-7;
      if (!moved) continue;
      next = next ?? { ...anims };
      if (freshnessOf(a) === "live" && a.movement_state === "moving") {
        const existing = anims[a.id];
        const from = existing ? animatedPos(existing, t) : { lng: prev.longitude, lat: prev.latitude };
        next[a.id] = { from, to: target, start: t };
      } else {
        delete next[a.id];
      }
    }
    if (next) setAnims(next);
  }
  const animating = Object.keys(anims).length > 0;
  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    const step = () => {
      const t = nowMs();
      setAnims((cur) => {
        const finished = Object.keys(cur).filter((id) => t - cur[id].start >= ANIM_MS);
        if (finished.length === 0) return cur;
        const n = { ...cur };
        for (const id of finished) delete n[id];
        return n;
      });
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  const assetGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const t = nowMs();
    return {
      type: "FeatureCollection",
      features: located.map((a) => {
        const anim = anims[a.id];
        const p = anim ? animatedPos(anim, t) : { lng: a.longitude!, lat: a.latitude! };
        const f = freshnessOf(a);
        return {
          type: "Feature",
          id: a.id,
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: {
            id: a.id,
            name: a.name,
            icon: iconId(a.type as AssetType, f, theme),
            heading: a.heading_deg ?? 0,
            moving: a.movement_state === "moving" && a.heading_deg != null && (f === "live" || f === "recent") ? 1 : 0,
            selected: a.id === selectedId ? 1 : 0,
            alerts: a.open_alert_count ?? 0,
          },
        };
      }),
    };
  }, [located, freshnessOf, selectedId, anims, theme]);

  const accuracyGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: located
        .filter((a) => a.accuracy_m != null && (a.accuracy_m >= 25 || a.id === selectedId))
        .map((a) => ({
          type: "Feature",
          geometry: circlePolygon({ lng: a.longitude!, lat: a.latitude! }, a.accuracy_m!),
          properties: { selected: a.id === selectedId ? 1 : 0 },
        })),
    }),
    [located, selectedId],
  );

  const placesGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: geofences.filter((g) => g.is_active).map((g) => ({ type: "Feature", id: g.id, geometry: g.geometry, properties: { name: g.name, color: g.color ?? pal.primary } })),
    }),
    [geofences, pal.primary],
  );

  const meGeoJson = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      me
        ? {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: circlePolygon(me, Math.max(me.accuracy, 5)), properties: { kind: "area" } },
              { type: "Feature", geometry: { type: "Point", coordinates: [me.lng, me.lat] }, properties: { kind: "dot" } },
            ],
          }
        : null,
    [me],
  );

  const trailGeoJson = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!trail || trail.length < 2) return null;
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: trail.map((p) => [p.longitude, p.latitude]) }, properties: {} },
        { type: "Feature", geometry: { type: "Point", coordinates: [trail[0].longitude, trail[0].latitude] }, properties: { kind: "start" } },
      ],
    };
  }, [trail]);

  const padding = useMemo(() => ({ top: 72 + (fitPadding?.top ?? 0), bottom: 72 + (fitPadding?.bottom ?? 0), left: 56 + (fitPadding?.left ?? 0), right: 56 + (fitPadding?.right ?? 0) }), [fitPadding]);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = located.map((a) => ({ lng: a.longitude!, lat: a.latitude! }));
    const b = bbox(pts);
    if (!b) return;
    if (pts.length === 1) map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 15, duration: 600, padding });
    else map.fitBounds(b, { padding, maxZoom: 16, duration: 600, pitch: map.getPitch(), bearing: map.getBearing() });
  }, [located, padding]);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy };
        setMe(next);
        setLocating(false);
        mapRef.current?.flyTo({ center: [next.lng, next.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 700, padding });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }, [padding]);

  useEffect(() => {
    if (loaded && fitOnLoad && !fittedRef.current && located.length > 0) {
      fittedRef.current = true;
      fitAll();
    }
  }, [loaded, fitOnLoad, located.length, fitAll]);

  useEffect(() => {
    if (!focusId || !loaded) return;
    const a = located.find((x) => x.id === focusId);
    if (a) mapRef.current?.flyTo({ center: [a.longitude!, a.latitude!], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 600, padding });
    // re-centre only when the focus target changes, not on every position update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loaded]);

  useEffect(() => {
    if (!trail || trail.length < 2 || !loaded) return;
    const b = bbox(trail.map((p) => ({ lng: p.longitude, lat: p.latitude })));
    const map = mapRef.current;
    if (b && map) map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600, pitch: map.getPitch(), bearing: map.getBearing() });
  }, [trail, loaded]);

  // Style switches drop custom images; re-register them. Satellite styles have no building heights.
  const register = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    registerAssetIcons(map);
    setHasBuildings(Boolean(map.getSource(BUILDING_SOURCE)));
  }, []);

  const onLoad = useCallback(() => {
    register();
    // A remembered 3D preference starts tilted, not just in globe projection.
    if (is3dRef.current) mapRef.current?.getMap().jumpTo({ pitch: PITCH_3D, bearing: BEARING_3D });
    setLoaded(true);
  }, [register]);

  // Tilt into 3D (or level out) from wherever the camera is; the projection follows the `projection` prop.
  const toggle3d = useCallback(() => {
    const next = !stored3d;
    setStored3d(next);
    mapRef.current?.easeTo({ pitch: next ? PITCH_3D : 0, bearing: next ? BEARING_3D : 0, duration: prefersReducedMotion() ? 0 : 900 });
  }, [stored3d, setStored3d]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const f = e.features?.[0];
      if (!f) {
        onSelect?.(null);
        return;
      }
      if (f.layer.id === "clusters") {
        const clusterId = f.properties?.cluster_id as number;
        const src = map.getSource("assets") as GeoJSONSource | undefined;
        if (!src || clusterId == null) return;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng, lat], zoom: zoom + 0.5, duration: 400 });
        });
        return;
      }
      if (f.properties?.id) onSelect?.(String(f.properties.id));
    },
    [onSelect],
  );

  const L: Record<string, LayerProps> = {
    buildings: {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: BUILDING_SOURCE,
      "source-layer": "building",
      minzoom: 14,
      filter: ["!=", ["get", "hide_3d"], true],
      layout: { visibility: is3d ? "visible" : "none" },
      paint: {
        // Most Lagos buildings are only 3-10 m tall, so dark mode needs clear contrast or they read as nothing.
        "fill-extrusion-color": theme === "dark" ? "#3a3833" : "#dcd7cc",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": theme === "dark" ? 0.9 : 0.8,
      },
    },
    placeFill: { id: "place-fill", type: "fill", source: "places", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.1 } },
    placeLine: { id: "place-line", type: "line", source: "places", paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.8 } },
    placeLabel: {
      id: "place-label",
      type: "symbol",
      source: "places",
      layout: { "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 12, "text-letter-spacing": 0.02 },
      paint: { "text-color": ["get", "color"], "text-halo-color": pal.halo, "text-halo-width": 1.5 },
    },
    trailLine: { id: "trail-line", type: "line", source: "trail", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": pal.primary, "line-width": 4, "line-opacity": 0.85 }, layout: { "line-join": "round", "line-cap": "round" } },
    trailStart: { id: "trail-start", type: "circle", source: "trail", filter: ["==", ["get", "kind"], "start"], paint: { "circle-radius": 6, "circle-color": pal.paper, "circle-stroke-color": pal.primary, "circle-stroke-width": 3 } },
    accFill: { id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": pal.primary, "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.14, 0.06] } },
    accLine: { id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": pal.primary, "line-opacity": 0.45, "line-width": 1, "line-dasharray": [2, 2] } },
    meArea: { id: "me-area", type: "fill", source: "me", filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": "#3b82f6", "fill-opacity": 0.12 } },
    meDot: { id: "me-dot", type: "circle", source: "me", filter: ["==", ["get", "kind"], "dot"], paint: { "circle-radius": 7, "circle-color": "#3b82f6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } },
    cluster: {
      id: "clusters",
      type: "circle",
      source: "assets",
      filter: ["has", "point_count"],
      paint: { "circle-color": pal.ink, "circle-stroke-color": pal.paper, "circle-stroke-width": 3, "circle-radius": ["step", ["get", "point_count"], 20, 10, 24, 50, 30] },
    },
    clusterCount: {
      id: "cluster-count",
      type: "symbol",
      source: "assets",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": LABEL_FONT, "text-size": 14 },
      paint: { "text-color": pal.paper },
    },
    halo: {
      id: "asset-selected",
      type: "circle",
      source: "assets",
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], 1]],
      paint: { "circle-radius": 30, "circle-color": pal.primary, "circle-opacity": 0.18, "circle-stroke-color": pal.primary, "circle-stroke-width": 2 },
    },
    arrow: {
      id: "asset-heading",
      type: "symbol",
      source: "assets",
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "moving"], 1]],
      layout: { "icon-image": `heading-arrow-${theme}`, "icon-size": 0.9, "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-offset": [0, -34], "icon-allow-overlap": true, "icon-ignore-placement": true },
    },
    point: {
      id: "asset-points",
      type: "symbol",
      source: "assets",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["case", ["==", ["get", "selected"], 1], 0.72, 0.58],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-field": ["get", "name"],
        "text-font": LABEL_FONT,
        "text-size": 12,
        "text-offset": [0, 1.7],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: { "text-color": pal.ink, "text-halo-color": pal.halo, "text-halo-width": 2 },
    },
    alertDot: {
      id: "asset-alert-dot",
      type: "circle",
      source: "assets",
      filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "alerts"], 0]],
      paint: { "circle-radius": 6, "circle-color": pal.danger, "circle-stroke-color": pal.paper, "circle-stroke-width": 2, "circle-translate": [13, -13] },
    },
  };

  return (
    <div className={cn("relative h-full w-full", className)}>
      <Map
        ref={mapRef}
        initialViewState={DEFAULT_VIEW}
        mapStyle={baseStyle}
        onLoad={onLoad}
        onStyleData={register}
        onClick={onClick}
        interactiveLayerIds={loaded ? ["asset-points", "clusters"] : []}
        interactive={interactive}
        projection={is3d ? "globe" : "mercator"}
        sky={is3d ? SKY[theme] : undefined}
        maxPitch={is3d ? 75 : 60}
        attributionControl={{ compact: true }}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
        cursor="pointer"
      >
        {loaded ? (
          <>
            <Source id="places" type="geojson" data={placesGeoJson}>
              <Layer {...L.placeFill} />
              <Layer {...L.placeLine} />
              <Layer {...L.placeLabel} />
            </Source>
            {/* Always mounted when the style has building heights, toggled by visibility, and kept below every Trakkka layer. */}
            {hasBuildings ? <Layer {...L.buildings} beforeId="place-fill" /> : null}
            {trailGeoJson ? (
              <Source id="trail" type="geojson" data={trailGeoJson}>
                <Layer {...L.trailLine} />
                <Layer {...L.trailStart} />
              </Source>
            ) : null}
            <Source id="accuracy" type="geojson" data={accuracyGeoJson}>
              <Layer {...L.accFill} />
              <Layer {...L.accLine} />
            </Source>
            {meGeoJson ? (
              <Source id="me" type="geojson" data={meGeoJson}>
                <Layer {...L.meArea} />
                <Layer {...L.meDot} />
              </Source>
            ) : null}
            <Source id="assets" type="geojson" data={assetGeoJson} cluster clusterRadius={48} clusterMaxZoom={15} promoteId="id">
              <Layer {...L.cluster} />
              <Layer {...L.clusterCount} />
              <Layer {...L.halo} />
              <Layer {...L.arrow} />
              <Layer {...L.point} />
              <Layer {...L.alertDot} />
            </Source>
          </>
        ) : null}
        {controls === "full" ? (
          <>
            {/* Built once by MapLibre, so the compass is always present rather than toggled with 3D. */}
            <NavigationControl position="bottom-right" showCompass visualizePitch />
            <ScaleControl position="bottom-left" />
          </>
        ) : null}
      </Map>

      {controls !== "none" ? (
        <div className={cn("absolute right-3 flex flex-col gap-2", controls === "full" ? "top-3" : "bottom-4", controlsClassName)}>
          <MapTool label="Show my location" onClick={locateMe} busy={locating}>
            <LocateFixed className="h-[18px] w-[18px]" />
          </MapTool>
          <MapTool label="Show all assets" onClick={fitAll} disabled={located.length === 0}>
            <Maximize2 className="h-[18px] w-[18px]" />
          </MapTool>
          <MapTool label={is3d ? "Flat map" : "3D view"} onClick={toggle3d} active={is3d}>
            {is3d ? <MapIcon className="h-[18px] w-[18px]" /> : <Box className="h-[18px] w-[18px]" />}
          </MapTool>
          {SATELLITE_AVAILABLE ? (
            <MapTool label={satellite ? "Street map" : "Satellite"} onClick={() => setSatellite((s) => !s)} active={satellite}>
              {satellite ? <Layers className="h-[18px] w-[18px]" /> : <Satellite className="h-[18px] w-[18px]" />}
            </MapTool>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MapTool({ children, label, onClick, disabled, active, busy }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean; busy?: boolean }) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card text-foreground shadow-md transition-colors hover:bg-muted active:scale-95 disabled:opacity-40",
          active && "bg-primary text-primary-foreground hover:bg-primary",
          busy && "animate-pulse",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
