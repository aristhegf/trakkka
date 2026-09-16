"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  GeolocateControl,
  Layer,
  NavigationControl,
  ScaleControl,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { GeoJSONSource, SkySpecification } from "maplibre-gl";
import "@/lib/map/setup";
import { Box, Layers, Map as MapIcon, Maximize2, Satellite } from "lucide-react";
import type { AssetOverview, AssetType, Freshness, Geofence, HistoryPoint } from "@/lib/types";
import { DARK_STYLE, DEFAULT_VIEW, LABEL_FONT, LIGHT_STYLE, SATELLITE_AVAILABLE, satelliteStyle } from "@/lib/map/styles";
import { iconId, registerAssetIcons } from "@/lib/map/icons";
import { bbox, circlePolygon, lerpLngLat, type LngLat } from "@/lib/geo";
import { useTheme } from "@/components/shell/ThemeProvider";
import { cn } from "@/lib/cn";
import { useStoredFlag } from "@/lib/use-stored-flag";

export interface AssetMapProps {
  assets: AssetOverview[];
  freshnessOf: (a: AssetOverview) => Freshness;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  geofences?: Geofence[];
  trail?: HistoryPoint[] | null;
  /** When set, the map fits/centres on this asset id whenever it changes. */
  focusId?: string | null;
  className?: string;
  interactive?: boolean;
  showControls?: boolean;
  fitOnLoad?: boolean;
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
    "fog-color": "#0b0f17",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 12, 0],
  },
  light: {
    "sky-color": "#8ec5ff",
    "horizon-color": "#dbeafe",
    "fog-color": "#f6f7f9",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 12, 0],
  },
};

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const nowMs = () => performance.now();

/** Eased position of an in-flight animation at time t. */
function animatedPos(a: Anim, t: number): LngLat {
  const k = Math.min(1, Math.max(0, (t - a.start) / ANIM_MS));
  const e = 1 - (1 - k) * (1 - k); // ease-out
  return lerpLngLat(a.from, a.to, e);
}

/**
 * The live map. One clustered GeoJSON source for assets, one for accuracy rings, one for geofences,
 * one for the optional trail. Marker positions animate between fixes only when the asset is LIVE.
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
  showControls = true,
  fitOnLoad = true,
}: AssetMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const { theme } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasBuildings, setHasBuildings] = useState(false);
  const fittedRef = useRef(false);
  // 3D is a per-browser preference, offered only on full maps (the small asset-page maps stay flat).
  const [stored3d, setStored3d] = useStoredFlag("trakkka-map-3d");
  const is3d = showControls && stored3d;
  const is3dRef = useRef(is3d);
  useEffect(() => {
    is3dRef.current = is3d;
  }, [is3d]);

  const baseStyle = useMemo(() => {
    if (satellite) return satelliteStyle() ?? (theme === "dark" ? DARK_STYLE : LIGHT_STYLE);
    return theme === "dark" ? DARK_STYLE : LIGHT_STYLE;
  }, [satellite, theme]);

  const located = useMemo(() => assets.filter((a) => a.latitude != null && a.longitude != null), [assets]);

  // ---- Movement animation. Animations are state; render-time diffing starts them and a rAF loop
  // (setState only inside its callback) advances and retires them. Only LIVE + moving assets animate.
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
            type: a.type,
            icon: iconId(a.type as AssetType, f),
            freshness: f,
            heading: a.heading_deg ?? 0,
            moving: a.movement_state === "moving" && a.heading_deg != null ? 1 : 0,
            selected: a.id === selectedId ? 1 : 0,
            alerts: a.open_alert_count ?? 0,
          },
        };
      }),
    };
    // `anims` changes on every animation frame (the rAF loop bumps state), which is what re-derives positions.
  }, [located, freshnessOf, selectedId, anims]);

  const accuracyGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: located
        .filter((a) => a.accuracy_m != null && (a.accuracy_m >= 25 || a.id === selectedId))
        .map((a) => ({
          type: "Feature",
          geometry: circlePolygon({ lng: a.longitude!, lat: a.latitude! }, a.accuracy_m!),
          properties: { id: a.id, selected: a.id === selectedId ? 1 : 0 },
        })),
    }),
    [located, selectedId],
  );

  const geofenceGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: geofences
        .filter((g) => g.is_active)
        .map((g) => ({
          type: "Feature",
          id: g.id,
          geometry: g.geometry,
          properties: { id: g.id, name: g.name, color: g.color ?? "#2563eb" },
        })),
    }),
    [geofences],
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

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = located.map((a) => ({ lng: a.longitude!, lat: a.latitude! }));
    const b = bbox(pts);
    if (!b) return;
    const camera = { pitch: map.getPitch(), bearing: map.getBearing() };
    if (pts.length === 1) map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 15, duration: 600, ...camera });
    else map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 600, ...camera });
  }, [located]);

  useEffect(() => {
    if (loaded && fitOnLoad && !fittedRef.current && located.length > 0) {
      fittedRef.current = true;
      fitAll();
    }
  }, [loaded, fitOnLoad, located.length, fitAll]);

  // Centre on the focused asset when it changes.
  useEffect(() => {
    if (!focusId || !loaded) return;
    const a = located.find((x) => x.id === focusId);
    if (a) mapRef.current?.flyTo({ center: [a.longitude!, a.latitude!], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 600 });
  }, [focusId, loaded, located]);

  // Fit to trail when it appears.
  useEffect(() => {
    if (!trail || trail.length < 2 || !loaded) return;
    const b = bbox(trail.map((p) => ({ lng: p.longitude, lat: p.latitude })));
    const map = mapRef.current;
    if (b && map) map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600, pitch: map.getPitch(), bearing: map.getBearing() });
  }, [trail, loaded]);

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    registerAssetIcons(map);
    setHasBuildings(Boolean(map.getSource(BUILDING_SOURCE)));
    // A remembered 3D preference starts tilted, not just in globe projection.
    if (is3dRef.current) map.jumpTo({ pitch: PITCH_3D, bearing: BEARING_3D });
    setLoaded(true);
  }, []);

  // Style switches drop custom images; re-register them. Satellite styles have no building heights.
  const onStyleData = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    registerAssetIcons(map);
    setHasBuildings(Boolean(map.getSource(BUILDING_SOURCE)));
  }, []);

  // Tilt into 3D (or level out) from wherever the camera is; the projection itself follows the `projection` prop.
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

  const clusterLayer: LayerProps = {
    id: "clusters",
    type: "circle",
    source: "assets",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": theme === "dark" ? "#1f2a40" : "#ffffff",
      "circle-stroke-color": "#2563eb",
      "circle-stroke-width": 3,
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28],
    },
  };
  const clusterCountLayer: LayerProps = {
    id: "cluster-count",
    type: "symbol",
    source: "assets",
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": LABEL_FONT, "text-size": 13 },
    paint: { "text-color": theme === "dark" ? "#e5e9f0" : "#0f172a" },
  };
  const selectedHaloLayer: LayerProps = {
    id: "asset-selected",
    type: "circle",
    source: "assets",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], 1]],
    paint: { "circle-radius": 26, "circle-color": "#2563eb", "circle-opacity": 0.2, "circle-stroke-color": "#2563eb", "circle-stroke-width": 2 },
  };
  const arrowLayer: LayerProps = {
    id: "asset-heading",
    type: "symbol",
    source: "assets",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "moving"], 1]],
    layout: {
      "icon-image": "heading-arrow",
      "icon-size": 0.9,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-offset": [0, -30],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  };
  const pointLayer: LayerProps = {
    id: "asset-points",
    type: "symbol",
    source: "assets",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["case", ["==", ["get", "selected"], 1], 0.75, 0.6],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "name"],
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-offset": [0, 1.6],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": theme === "dark" ? "#e5e9f0" : "#0f172a",
      "text-halo-color": theme === "dark" ? "#0b0f17" : "#ffffff",
      "text-halo-width": 1.5,
    },
  };
  const alertDotLayer: LayerProps = {
    id: "asset-alert-dot",
    type: "circle",
    source: "assets",
    filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "alerts"], 0]],
    paint: { "circle-radius": 5, "circle-color": "#ef4444", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-translate": [12, -12] },
  };
  const accuracyFill: LayerProps = {
    id: "accuracy-fill",
    type: "fill",
    source: "accuracy",
    paint: { "fill-color": "#2563eb", "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.14, 0.07] },
  };
  const accuracyLine: LayerProps = {
    id: "accuracy-line",
    type: "line",
    source: "accuracy",
    paint: { "line-color": "#2563eb", "line-opacity": 0.5, "line-width": 1, "line-dasharray": [2, 2] },
  };
  const geofenceFill: LayerProps = { id: "geofence-fill", type: "fill", source: "geofences", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 } };
  const geofenceLine: LayerProps = { id: "geofence-line", type: "line", source: "geofences", paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [3, 2] } };
  const geofenceLabel: LayerProps = {
    id: "geofence-label",
    type: "symbol",
    source: "geofences",
    layout: { "text-field": ["get", "name"], "text-font": LABEL_FONT, "text-size": 11, "symbol-placement": "line", "text-letter-spacing": 0.05 },
    paint: { "text-color": ["get", "color"], "text-halo-color": theme === "dark" ? "#0b0f17" : "#ffffff", "text-halo-width": 1.5 },
  };
  const buildings3d: LayerProps = {
    id: "buildings-3d",
    type: "fill-extrusion",
    source: BUILDING_SOURCE,
    "source-layer": "building",
    minzoom: 14,
    filter: ["!=", ["get", "hide_3d"], true],
    layout: { visibility: is3d ? "visible" : "none" },
    paint: {
      // Dark mode needs visible contrast: most Lagos buildings are only 3-10 m tall, so faint blocks read as nothing.
      "fill-extrusion-color": theme === "dark" ? "#34425e" : "#d9d6cf",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": theme === "dark" ? 0.9 : 0.8,
    },
  };
  const trailLine: LayerProps = { id: "trail-line", type: "line", source: "trail", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2563eb", "line-width": 3, "line-opacity": 0.8 }, layout: { "line-join": "round", "line-cap": "round" } };
  const trailStart: LayerProps = { id: "trail-start", type: "circle", source: "trail", filter: ["==", ["get", "kind"], "start"], paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#2563eb", "circle-stroke-width": 2 } };

  return (
    <div className={cn("relative h-full w-full", className)}>
      <Map
        ref={mapRef}
        initialViewState={DEFAULT_VIEW}
        mapStyle={baseStyle}
        onLoad={onLoad}
        onStyleData={onStyleData}
        onClick={onClick}
        interactiveLayerIds={loaded ? ["asset-points", "clusters"] : []}
        interactive={interactive}
        projection={is3d ? "globe" : "mercator"}
        sky={is3d ? SKY[theme === "dark" ? "dark" : "light"] : undefined}
        maxPitch={is3d ? 75 : 60}
        attributionControl={{ compact: true }}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
        cursor="pointer"
      >
        {loaded ? (
          <>
            <Source id="geofences" type="geojson" data={geofenceGeoJson}>
              <Layer {...geofenceFill} />
              <Layer {...geofenceLine} />
              <Layer {...geofenceLabel} />
            </Source>
            {/* Always mounted when the style has building heights, toggled by visibility, and kept below every Trakkka layer. */}
            {hasBuildings ? <Layer {...buildings3d} beforeId="geofence-fill" /> : null}
            {trailGeoJson ? (
              <Source id="trail" type="geojson" data={trailGeoJson}>
                <Layer {...trailLine} />
                <Layer {...trailStart} />
              </Source>
            ) : null}
            <Source id="accuracy" type="geojson" data={accuracyGeoJson}>
              <Layer {...accuracyFill} />
              <Layer {...accuracyLine} />
            </Source>
            <Source id="assets" type="geojson" data={assetGeoJson} cluster clusterRadius={44} clusterMaxZoom={15} promoteId="id">
              <Layer {...clusterLayer} />
              <Layer {...clusterCountLayer} />
              <Layer {...selectedHaloLayer} />
              <Layer {...arrowLayer} />
              <Layer {...pointLayer} />
              <Layer {...alertDotLayer} />
            </Source>
          </>
        ) : null}
        {showControls ? (
          <>
            {/* Controls are built once by MapLibre, so the compass is always shown rather than toggled with 3D. */}
            <NavigationControl position="top-right" showCompass visualizePitch />
            <GeolocateControl position="top-right" trackUserLocation={false} showUserLocation />
            <ScaleControl position="bottom-right" />
          </>
        ) : null}
      </Map>
      {showControls ? (
        <div className="absolute right-2.5 top-[150px] flex flex-col gap-1.5">
          {/* Below MapLibre's top-right stack: zoom + compass (10-99px) and geolocate (109-140px), plus its 10px gap. */}
          <MapButton label="Fit all assets" onClick={fitAll}>
            <Maximize2 className="h-4 w-4" />
          </MapButton>
          <MapButton label={is3d ? "Flat map view" : "3D view: globe, tilt and buildings"} onClick={toggle3d} active={is3d}>
            {is3d ? <MapIcon className="h-4 w-4" /> : <Box className="h-4 w-4" />}
          </MapButton>
          <MapButton
            label={SATELLITE_AVAILABLE ? (satellite ? "Map view" : "Satellite view") : "Satellite view needs a tile key (see .env.example)"}
            onClick={() => SATELLITE_AVAILABLE && setSatellite((s) => !s)}
            disabled={!SATELLITE_AVAILABLE}
            active={satellite}
          >
            {satellite ? <Layers className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
          </MapButton>
        </div>
      ) : null}
    </div>
  );
}

function MapButton({ children, label, onClick, disabled, active }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[29px] w-[29px] items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm hover:bg-surface-2 disabled:opacity-40",
        active && "bg-accent text-accent-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
