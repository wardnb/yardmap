"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin, Layers, X, Navigation, Ruler, Map as MapIcon,
  Satellite, Eye, EyeOff, Camera, Plus, Leaf, CheckSquare,
  Footprints, Calculator, ChevronDown, ChevronUp, Loader2,
  AlertCircle, ZapIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mockZones, mockPlants } from "@/lib/mock-data";
import { polylineDistanceFt, polygonAreaSqFt, fmtFt, fmtM, fmtArea, mulchBags, mulchCuYd, plantCount } from "@/lib/geo";
import { extractExifGps, createPhotoUrl } from "@/lib/exif";
import { identifyPlant, diagnoseHealth } from "@/lib/ai-plant";

const BOISE_COORDS: [number, number] = [-116.2023, 43.6150];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type MapMode = "view" | "measure" | "boundary-walk" | "draw-zone";
type MapLayer = "zones" | "plants" | "tasks" | "photos" | "measurements";
type BaseStyle = "satellite" | "streets" | "outdoors";

const STYLES: Record<BaseStyle, string> = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/dark-v11",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
};

interface PhotoPin {
  id: string;
  url: string;
  lng: number;
  lat: number;
  label: string;
  hasExifGps: boolean;
}

interface MeasurementLine {
  id: string;
  coords: [number, number][];
  distanceFt: number;
  distanceM: number;
}

interface WalkBoundary {
  coords: [number, number][];
  active: boolean;
  watchId: number | null;
}

interface ZoneCalcResult {
  sqFt: number;
  mulchBags2in: number;
  mulchBags3in: number;
  mulchCuYd: number;
  plantsAt12in: number;
  plantsAt18in: number;
  plantsAt24in: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildZoneFeatures() {
  const base = BOISE_COORDS;
  const offset = 0.0003;
  return mockZones.map((zone, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const cx = base[0] + (col - 0.5) * offset * 3;
    const cy = base[1] + (row - 0.5) * offset * 2;
    const ring: [number, number][] = [
      [cx - offset, cy - offset * 0.6],
      [cx + offset, cy - offset * 0.6],
      [cx + offset, cy + offset * 0.6],
      [cx - offset, cy + offset * 0.6],
      [cx - offset, cy - offset * 0.6],
    ];
    const sqFt = polygonAreaSqFt(ring.slice(0, 4));
    return {
      type: "Feature" as const,
      properties: { id: zone.id, name: zone.name, type: zone.type, color: zone.color, sqFt },
      geometry: { type: "Polygon" as const, coordinates: [ring] },
    };
  });
}

// ── main component ────────────────────────────────────────────────────────────

export default function PropertyMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapboxRef = useRef<any>(null);
  const userMarkerRef = useRef<unknown>(null);
  const measureMarkersRef = useRef<unknown[]>([]);
  const walkMarkerRef = useRef<unknown>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [noToken, setNoToken] = useState(false);
  const [mode, setMode] = useState<MapMode>("view");
  const [baseStyle, setBaseStyle] = useState<BaseStyle>("satellite");
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    zones: true, plants: true, tasks: false, photos: true, measurements: true,
  });

  const [selected, setSelected] = useState<{ type: "zone" | "plant"; id: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Measurements
  const [measureCoords, setMeasureCoords] = useState<[number, number][]>([]);
  const [measurements, setMeasurements] = useState<MeasurementLine[]>([]);

  // Boundary walk
  const [walk, setWalk] = useState<WalkBoundary>({ coords: [], active: false, watchId: null });
  const [walkArea, setWalkArea] = useState<ZoneCalcResult | null>(null);

  // Photos
  const [, setPhotos] = useState<PhotoPin[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState<PhotoPin | null>(null);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Zone calc panel
  const [calcDepth, setCalcDepth] = useState(2);
  const [calcSpacing, setCalcSpacing] = useState(18);

  // Panel visibility
  const [showLayers, setShowLayers] = useState(false);
  const [showFab, setShowFab] = useState(false);

  // ── map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current) return;
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "pk.your-mapbox-token") {
      setNoToken(true);
      return;
    }

    let cancelled = false;

    const init = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      // CSS loaded via next.config transpilePackages — no dynamic import needed
      if (cancelled) return;

      mapboxRef.current = mapboxgl;
      (mapboxgl as { accessToken: string }).accessToken = MAPBOX_TOKEN;

      const m = new mapboxgl.Map({
        container: mapContainer.current!,
        style: STYLES[baseStyle],
        center: BOISE_COORDS,
        zoom: 17,
        pitchWithRotate: false,
      });
      mapRef.current = m;

      m.on("load", () => {
        if (cancelled) return;
        addZoneLayers(m);
        addPlantMarkers(m, mapboxgl);
        setMapLoaded(true);
      });
    };

    init();
    return () => { cancelled = true; mapRef.current?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── layer toggle effect ───────────────────────────────────────────────────

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    ["zones-fill", "zones-border", "zones-label"].forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", layers.zones ? "visible" : "none");
    });
    document.querySelectorAll<HTMLElement>(".plant-marker").forEach(el => {
      el.style.display = layers.plants ? "" : "none";
    });
    document.querySelectorAll<HTMLElement>(".photo-marker").forEach(el => {
      el.style.display = layers.photos ? "" : "none";
    });
  }, [layers, mapLoaded]);

  // ── base style change ─────────────────────────────────────────────────────

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    m.once("styledata", () => {
      addZoneLayers(m);
    });
    m.setStyle(STYLES[baseStyle]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseStyle]);

  // ── map click handler (mode-aware) ────────────────────────────────────────

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;

    const handleClick = (e: { lngLat: { lng: number; lat: number } }) => {
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (mode === "measure") {
        setMeasureCoords(prev => {
          const next = [...prev, pt];
          drawMeasureLine(m, next);
          return next;
        });
      }
    };

    m.on("click", handleClick);
    return () => m.off("click", handleClick);
  }, [mode, mapLoaded]);

  // ── helpers: add layers ───────────────────────────────────────────────────

  function addZoneLayers(m: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = m as any;
    if (!map.getSource("zones")) {
      map.addSource("zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: buildZoneFeatures() },
      });
    }
    if (!map.getLayer("zones-fill")) {
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 } });
    }
    if (!map.getLayer("zones-border")) {
      map.addLayer({ id: "zones-border", type: "line", source: "zones", paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.8 } });
    }
    if (!map.getLayer("zones-label")) {
      map.addLayer({ id: "zones-label", type: "symbol", source: "zones", layout: { "text-field": ["get", "name"], "text-size": 11, "text-anchor": "center" }, paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1 } });
    }

    map.on("click", "zones-fill", (e: { features?: { properties?: { id?: string } }[] }) => {
      const id = e.features?.[0]?.properties?.id;
      if (id && mode === "view") setSelected({ type: "zone", id });
    });
    map.on("mouseenter", "zones-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = ""; });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addPlantMarkers(m: unknown, mapboxgl: any) {
    mockPlants.forEach((plant, i) => {
      const offset = 0.0001;
      const row = Math.floor(i / 3);
      const col = i % 3;
      const cx = BOISE_COORDS[0] + (col - 1) * offset * 2;
      const cy = BOISE_COORDS[1] + (row - 1) * offset * 1.5;

      const el = document.createElement("div");
      el.className = "plant-marker";
      el.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%; cursor: pointer;
        background: ${plant.status === "healthy" ? "#4ade80" : plant.status === "needs_attention" ? "#facc15" : "#f87171"};
        border: 2px solid rgba(0,0,0,0.6); box-shadow: 0 0 0 2px rgba(255,255,255,0.2);
        transition: transform 0.1s;
      `;
      el.title = plant.name;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.4)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected({ type: "plant", id: plant.id });
      });

      new mapboxgl.Marker({ element: el }).setLngLat([cx, cy]).addTo(m as object);
    });
  }

  // ── GPS: go to my location ────────────────────────────────────────────────

  const goToMyLocation = useCallback(() => {
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        const m = mapRef.current;
        const mapboxgl = mapboxRef.current;
        setGpsLoading(false);

        if (m && mapboxgl) {
          m.flyTo({ center: [longitude, latitude], zoom: 18, speed: 1.5 });

          // Remove old marker
          if (userMarkerRef.current) (userMarkerRef.current as { remove: () => void }).remove();

          const el = document.createElement("div");
          el.style.cssText = `
            width: 20px; height: 20px; border-radius: 50%;
            background: #3b82f6; border: 3px solid white;
            box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
          `;
          const pulse = document.createElement("div");
          pulse.style.cssText = `
            position: absolute; width: 40px; height: 40px; border-radius: 50%;
            top: -13px; left: -13px;
            background: rgba(59,130,246,0.15);
            animation: pulse 2s infinite;
          `;
          el.appendChild(pulse);

          userMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(m);
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.message || "Location unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Boundary walk ──────────────────────────────────────────────────────────

  const startWalk = useCallback(() => {
    setWalk({ coords: [], active: true, watchId: null });
    setMode("boundary-walk");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setWalk(prev => {
          const coords = [...prev.coords, pt];

          const m = mapRef.current;
          const mapboxgl = mapboxRef.current;
          if (m && mapboxgl) {
            // Update walk line on map
            const src = m.getSource("walk-line");
            const data = {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              }],
            };
            if (src) {
              src.setData(data);
            } else {
              m.addSource("walk-line", { type: "geojson", data });
              m.addLayer({ id: "walk-line", type: "line", source: "walk-line", paint: { "line-color": "#f59e0b", "line-width": 3, "line-dasharray": [2, 1] } });
            }

            // Move walk marker
            if (walkMarkerRef.current) (walkMarkerRef.current as { setLngLat: (c: [number,number]) => void }).setLngLat(pt);
            else {
              const el = document.createElement("div");
              el.style.cssText = `
                width: 16px; height: 16px; border-radius: 50%;
                background: #f59e0b; border: 2px solid white;
                box-shadow: 0 0 8px rgba(245,158,11,0.8);
              `;
              walkMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(pt).addTo(m);
            }
          }
          return { ...prev, coords, watchId: id };
        });
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    setWalk(prev => ({ ...prev, watchId: id }));
  }, []);

  const stopWalk = useCallback(() => {
    setWalk(prev => {
      if (prev.watchId !== null) navigator.geolocation.clearWatch(prev.watchId);
      const sqFt = polygonAreaSqFt(prev.coords);
      setWalkArea({
        sqFt,
        mulchBags2in: mulchBags(sqFt, 2),
        mulchBags3in: mulchBags(sqFt, 3),
        mulchCuYd: mulchCuYd(sqFt, 3),
        plantsAt12in: plantCount(sqFt, 12),
        plantsAt18in: plantCount(sqFt, 18),
        plantsAt24in: plantCount(sqFt, 24),
      });

      // Close boundary polygon on map
      const m = mapRef.current;
      if (m && prev.coords.length > 2) {
        const closedCoords = [...prev.coords, prev.coords[0]];
        const data = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [closedCoords] },
          }],
        };
        const src = m.getSource("walk-polygon");
        if (src) {
          src.setData(data);
        } else {
          m.addSource("walk-polygon", { type: "geojson", data });
          m.addLayer({ id: "walk-polygon-fill", type: "fill", source: "walk-polygon", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.2 } });
          m.addLayer({ id: "walk-polygon-border", type: "line", source: "walk-polygon", paint: { "line-color": "#f59e0b", "line-width": 2 } });
        }
      }
      return { ...prev, active: false, watchId: null };
    });
    setMode("view");
  }, []);

  // ── Measure line ──────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function drawMeasureLine(m: any, coords: [number, number][]) {
    const data = {
      type: "FeatureCollection",
      features: coords.length > 1 ? [{
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      }] : [],
    };
    const src = m.getSource("measure-line");
    if (src) src.setData(data);
    else {
      m.addSource("measure-line", { type: "geojson", data });
      m.addLayer({ id: "measure-line", type: "line", source: "measure-line", paint: { "line-color": "#a855f7", "line-width": 2, "line-dasharray": [3, 1] } });
    }

    // Add point marker via DOM
    const mapboxgl = mapboxRef.current;
    if (!mapboxgl) return;
    const el = document.createElement("div");
    el.style.cssText = "width:8px;height:8px;border-radius:50%;background:#a855f7;border:2px solid white;";
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(coords[coords.length - 1])
      .addTo(m);
    (measureMarkersRef.current as unknown[]).push(marker);
  }

  const finishMeasure = () => {
    if (measureCoords.length < 2) { setMeasureCoords([]); setMode("view"); return; }
    const ft = polylineDistanceFt(measureCoords);
    setMeasurements(prev => [...prev, {
      id: `m${Date.now()}`, coords: measureCoords,
      distanceFt: ft, distanceM: ft / 3.28084,
    }]);
    setMeasureCoords([]);
    setMode("view");
  };

  const clearMeasurements = () => {
    (measureMarkersRef.current as { remove: () => void }[]).forEach(m => m.remove());
    measureMarkersRef.current = [];
    const map = mapRef.current;
    if (map) {
      if (map.getLayer("measure-line")) map.removeLayer("measure-line");
      if (map.getSource("measure-line")) map.removeSource("measure-line");
    }
    setMeasurements([]);
    setMeasureCoords([]);
  };

  // ── Photo upload ──────────────────────────────────────────────────────────

  const handlePhotoUpload = useCallback(async (file: File, label: string) => {
    const url = createPhotoUrl(file);
    const exif = await extractExifGps(file);

    let lng = BOISE_COORDS[0];
    let lat = BOISE_COORDS[1];
    let hasExifGps = false;

    if (exif) {
      lng = exif.lng;
      lat = exif.lat;
      hasExifGps = true;
    } else {
      // Use current map center
      const m = mapRef.current;
      if (m) {
        const center = m.getCenter();
        lng = center.lng;
        lat = center.lat;
      }
    }

    const pin: PhotoPin = { id: `ph${Date.now()}`, url, lng, lat, label, hasExifGps };
    setPhotos(prev => [...prev, pin]);

    // Add marker to map
    const mapboxgl = mapboxRef.current;
    const m = mapRef.current;
    if (mapboxgl && m) {
      const el = document.createElement("div");
      el.className = "photo-marker";
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 8px;
        background: #1e293b; border: 2px solid #a855f7;
        cursor: pointer; overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      `;
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      el.appendChild(img);
      el.addEventListener("click", () => setShowPhotoModal(pin));

      new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);

      if (hasExifGps) {
        m.flyTo({ center: [lng, lat], zoom: 18 });
      }
    }
  }, []);

  // ── AI identification ─────────────────────────────────────────────────────

  const runAiIdentify = useCallback(async (file: File, mode: "identify" | "diagnose", plantName?: string) => {
    setAiLoading(true);
    setAiResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (mode === "identify") {
        const r = await identifyPlant(dataUrl);
        if (r.isPlaceholder) setAiResult(r.notes || "");
        else if (r.identified) setAiResult(`🌿 **${r.commonName}** (*${r.scientificName}*)\n${r.notes}\n\n💧 ${r.careInstructions}`);
        else setAiResult("Could not identify — try a clearer photo of the leaves/flowers.");
      } else {
        const r = await diagnoseHealth(dataUrl, plantName);
        if (r.isPlaceholder) setAiResult((r.recommendations || []).join("\n"));
        else {
          const issues = r.issues?.length ? `\n⚠️ Issues: ${r.issues.join(", ")}` : "";
          const recs = r.recommendations?.length ? `\n✅ ${r.recommendations.join("\n✅ ")}` : "";
          setAiResult(`Status: **${r.status}**${issues}${recs}`);
        }
      }
      setAiLoading(false);
    };
    reader.readAsDataURL(file);
  }, []);

  // ── selected zone/plant ───────────────────────────────────────────────────

  const selectedZone = selected?.type === "zone" ? mockZones.find(z => z.id === selected.id) : null;
  const selectedPlant = selected?.type === "plant" ? mockPlants.find(p => p.id === selected.id) : null;
  const selectedZoneFeature = selectedZone
    ? buildZoneFeatures().find(f => f.properties.id === selectedZone.id)
    : null;
  const zoneSqFt = selectedZoneFeature?.properties.sqFt || 0;

  // ── no-token fallback ─────────────────────────────────────────────────────

  if (noToken) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-card text-center p-8 gap-4">
        <MapPin className="w-16 h-16 text-muted-foreground opacity-50" />
        <div>
          <h2 className="text-xl font-semibold mb-2">Mapbox Token Required</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Add your Mapbox token to <code className="bg-muted px-1 rounded">.env.local</code>:
          </p>
          <pre className="mt-3 text-left text-xs bg-muted rounded-lg p-3 text-green-400">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.your.token
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            Get a free token at{" "}
            <a href="https://mapbox.com" className="text-primary underline" target="_blank" rel="noreferrer">mapbox.com</a>
          </p>
        </div>
        <ZoneFallbackList />
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full bg-black overflow-hidden">
      {/* Map canvas */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* ── Top toolbar ── */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
        {/* Style + layer toggles */}
        <div className="pointer-events-auto flex flex-col gap-1">
          <div className="flex gap-1">
            {(["satellite", "streets", "outdoors"] as BaseStyle[]).map(s => (
              <button
                key={s}
                onClick={() => setBaseStyle(s)}
                className={`px-2 py-1 text-xs rounded-md border font-medium transition-colors ${
                  baseStyle === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white border-white/20 hover:bg-black/80"
                }`}
              >
                {s === "satellite" ? <Satellite className="w-3 h-3 inline mr-1" /> : <MapIcon className="w-3 h-3 inline mr-1" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Layer toggles */}
          <button
            onClick={() => setShowLayers(v => !v)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-black/60 text-white rounded-md border border-white/20 hover:bg-black/80 w-fit"
          >
            <Layers className="w-3 h-3" />
            Layers
            {showLayers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showLayers && (
            <div className="bg-black/80 rounded-lg border border-white/20 p-2 space-y-1 text-xs text-white">
              {(Object.keys(layers) as MapLayer[]).map(layer => (
                <label key={layer} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={layers[layer]}
                    onChange={e => setLayers(prev => ({ ...prev, [layer]: e.target.checked }))}
                    className="accent-green-400"
                  />
                  <span className="capitalize">{layer}</span>
                  {layers[layer] ? <Eye className="w-3 h-3 text-green-400" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Measurement results */}
        {measurements.length > 0 && layers.measurements && (
          <div className="pointer-events-auto bg-black/70 rounded-lg border border-purple-500/40 p-2 text-xs text-white max-w-48">
            {measurements.map(m => (
              <div key={m.id} className="flex items-center gap-1">
                <Ruler className="w-3 h-3 text-purple-400" />
                <span>{fmtFt(m.distanceFt)}</span>
                <span className="text-white/50">/ {fmtM(m.distanceM)}</span>
              </div>
            ))}
            <button onClick={clearMeasurements} className="text-red-400 hover:text-red-300 mt-1 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Mode toolbar (bottom-center, above FAB) ── */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
        <ModeButton
          active={mode === "measure"}
          icon={<Ruler className="w-4 h-4" />}
          label="Measure"
          onClick={() => {
            if (mode === "measure") { finishMeasure(); }
            else { setMode("measure"); setMeasureCoords([]); }
          }}
          activeColor="bg-purple-600 border-purple-400"
        />
        <ModeButton
          active={mode === "boundary-walk"}
          icon={<Footprints className="w-4 h-4" />}
          label={walk.active ? `Walk (${walk.coords.length}pts)` : "Walk Boundary"}
          onClick={() => walk.active ? stopWalk() : startWalk()}
          activeColor="bg-amber-600 border-amber-400"
        />
      </div>

      {/* ── GPS + FAB buttons (bottom-right) ── */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
        {/* FAB sub-buttons */}
        {showFab && (
          <div className="flex flex-col gap-2 items-end mb-1">
            <FabSubButton
              icon={<Leaf className="w-4 h-4" />}
              label="Add Plant"
              href="/plants"
              color="bg-green-600"
            />
            <FabSubButton
              icon={<CheckSquare className="w-4 h-4" />}
              label="Add Task"
              href="/tasks"
              color="bg-blue-600"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-lg border border-white/20">Take Photo</span>
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shadow-lg">
                <Camera className="w-4 h-4 text-white" />
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f, f.name);
                  setShowFab(false);
                }}
              />
            </label>
          </div>
        )}

        {/* GPS button */}
        <button
          onClick={goToMyLocation}
          disabled={gpsLoading}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl border-2 transition-colors ${
            gpsLoading ? "bg-blue-400 border-blue-300" : "bg-blue-600 hover:bg-blue-500 border-blue-400"
          }`}
          title="My Location"
        >
          {gpsLoading
            ? <Loader2 className="w-5 h-5 text-white animate-spin" />
            : <Navigation className="w-5 h-5 text-white" />}
        </button>

        {/* Main FAB */}
        <button
          onClick={() => setShowFab(v => !v)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-2 transition-all ${
            showFab ? "bg-red-600 border-red-400 rotate-45" : "bg-primary hover:bg-primary/90 border-primary/50"
          }`}
        >
          <Plus className="w-6 h-6 text-primary-foreground" />
        </button>
      </div>

      {/* GPS error toast */}
      {gpsError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-500 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 pointer-events-auto">
          <AlertCircle className="w-4 h-4" />
          {gpsError}
          <button onClick={() => setGpsError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Measure mode hint */}
      {mode === "measure" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-purple-900/90 border border-purple-500 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 pointer-events-auto">
          <Ruler className="w-4 h-4" />
          {measureCoords.length === 0 ? "Click map to start measuring" : `${measureCoords.length} points · Click Measure again to finish`}
        </div>
      )}

      {/* Walk mode hint */}
      {mode === "boundary-walk" && walk.active && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-900/90 border border-amber-500 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2 pointer-events-auto">
          <Footprints className="w-4 h-4" />
          Walking boundary… {walk.coords.length} GPS points. Tap &quot;Walk Boundary&quot; to stop.
        </div>
      )}

      {/* ── Zone detail panel ── */}
      {selectedZone && (
        <SidePanel onClose={() => setSelected(null)}>
          <ZonePanel
            zone={selectedZone}
            sqFt={zoneSqFt}
            calcDepth={calcDepth}
            setCalcDepth={setCalcDepth}
            calcSpacing={calcSpacing}
            setCalcSpacing={setCalcSpacing}
          />
        </SidePanel>
      )}

      {/* ── Plant detail panel ── */}
      {selectedPlant && (
        <SidePanel onClose={() => setSelected(null)}>
          <PlantPanel plant={selectedPlant} onAi={runAiIdentify} aiLoading={aiLoading} aiResult={aiResult} />
        </SidePanel>
      )}

      {/* ── Walk area result ── */}
      {walkArea && !walk.active && (
        <SidePanel onClose={() => setWalkArea(null)}>
          <WalkResultPanel result={walkArea} />
        </SidePanel>
      )}

      {/* ── Photo modal ── */}
      {showPhotoModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4 pointer-events-auto"
          onClick={() => setShowPhotoModal(null)}>
          <div className="relative max-w-md w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowPhotoModal(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={showPhotoModal.url} alt={showPhotoModal.label} className="rounded-xl w-full" />
            <div className="mt-2 text-sm text-white">{showPhotoModal.label}</div>
            {showPhotoModal.hasExifGps && (
              <div className="text-xs text-green-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" /> GPS from EXIF · {showPhotoModal.lat.toFixed(5)}, {showPhotoModal.lng.toFixed(5)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SidePanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 md:right-auto md:left-4 md:w-80 bg-card border border-border rounded-xl shadow-2xl p-4 pointer-events-auto max-h-[60vh] overflow-y-auto">
      <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}

function ModeButton({ active, icon, label, onClick, activeColor }: {
  active: boolean; icon: React.ReactNode; label: string;
  onClick: () => void; activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border shadow-lg transition-colors ${
        active
          ? `${activeColor} text-white`
          : "bg-black/70 text-white border-white/20 hover:bg-black/90"
      }`}
    >
      {icon}{label}
    </button>
  );
}

function FabSubButton({ icon, label, href, color }: { icon: React.ReactNode; label: string; href: string; color: string }) {
  return (
    <a href={href} className="flex items-center gap-2">
      <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-lg border border-white/20">{label}</span>
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shadow-lg`}>
        <span className="text-white">{icon}</span>
      </div>
    </a>
  );
}

function ZonePanel({ zone, sqFt, calcDepth, setCalcDepth, calcSpacing, setCalcSpacing }: {
  zone: typeof mockZones[0]; sqFt: number;
  calcDepth: number; setCalcDepth: (v: number) => void;
  calcSpacing: number; setCalcSpacing: (v: number) => void;
}) {
  const plants = mockPlants.filter(p => p.zone_id === zone.id);
  const cuYd = mulchCuYd(sqFt, calcDepth);
  const numPlants = plantCount(sqFt, calcSpacing);

  return (
    <div className="space-y-3 pr-6">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm" style={{ background: zone.color }} />
        <h3 className="font-semibold">{zone.name}</h3>
        <Badge variant="outline" className="text-xs capitalize ml-auto">{zone.type.replace("_", " ")}</Badge>
      </div>

      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Calculator className="w-3.5 h-3.5" /> Area
          </div>
          <div className="font-semibold text-primary">{fmtArea(sqFt)}</div>
        </div>
      )}

      {/* Mulch calculator */}
      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-2">
          <div className="font-medium text-muted-foreground flex items-center gap-1">
            <ZapIcon className="w-3.5 h-3.5" /> Mulch Calculator
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Depth:</label>
            <select
              value={calcDepth}
              onChange={e => setCalcDepth(Number(e.target.value))}
              className="bg-background border border-border rounded px-1 py-0.5 text-xs"
            >
              {[1,2,3,4].map(d => <option key={d} value={d}>{d}&quot;</option>)}
            </select>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>🛍️ <span className="text-foreground font-medium">{mulchBags(sqFt, calcDepth)} bags</span> (2 cu ft bags)</div>
            <div>🚚 <span className="text-foreground font-medium">{cuYd} cu yd</span> bulk order</div>
          </div>
        </div>
      )}

      {/* Plant spacing calculator */}
      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-2">
          <div className="font-medium text-muted-foreground flex items-center gap-1">
            <Leaf className="w-3.5 h-3.5 text-green-400" /> Plant Spacing
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Spacing:</label>
            <select
              value={calcSpacing}
              onChange={e => setCalcSpacing(Number(e.target.value))}
              className="bg-background border border-border rounded px-1 py-0.5 text-xs"
            >
              {[6,9,12,18,24,36].map(s => <option key={s} value={s}>{s}&quot;</option>)}
            </select>
          </div>
          <div>🌱 Fits <span className="text-foreground font-medium">{numPlants} plants</span> at {calcSpacing}&quot; spacing</div>
        </div>
      )}

      {zone.notes && <p className="text-xs text-muted-foreground">{zone.notes}</p>}

      {plants.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">{plants.length} plant{plants.length !== 1 ? "s" : ""} in this zone</div>
          {plants.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-xs py-0.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                p.status === "healthy" ? "bg-green-400" : p.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"
              }`} />
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlantPanel({ plant, onAi, aiLoading, aiResult }: {
  plant: typeof mockPlants[0];
  onAi: (f: File, mode: "identify" | "diagnose", name?: string) => void;
  aiLoading: boolean;
  aiResult: string | null;
}) {
  return (
    <div className="space-y-3 pr-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          plant.status === "healthy" ? "bg-green-400" : plant.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"
        }`} />
        <h3 className="font-semibold">{plant.name}</h3>
        <Badge
          variant={plant.status === "healthy" ? "success" : plant.status === "needs_attention" ? "warning" : "danger"}
          className="text-xs"
        >
          {plant.status.replace("_", " ")}
        </Badge>
      </div>
      {plant.species && <p className="text-xs text-muted-foreground italic">{plant.species}</p>}
      {plant.notes && <p className="text-xs text-muted-foreground">{plant.notes}</p>}

      {/* AI buttons */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">AI Analysis</div>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <span className="block w-full text-center text-xs py-2 rounded-lg bg-green-900/40 border border-green-700/40 text-green-400 hover:bg-green-900/60 transition-colors">
              🌿 Identify
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onAi(f, "identify"); }} />
          </label>
          <label className="flex-1 cursor-pointer">
            <span className="block w-full text-center text-xs py-2 rounded-lg bg-yellow-900/40 border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors">
              🔍 Diagnose
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onAi(f, "diagnose", plant.name); }} />
          </label>
        </div>
        {aiLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
          </div>
        )}
        {aiResult && (
          <div className="bg-muted/50 rounded-lg p-2 text-xs whitespace-pre-wrap text-foreground/80">
            {aiResult}
          </div>
        )}
      </div>
    </div>
  );
}

function WalkResultPanel({ result }: { result: ZoneCalcResult }) {
  return (
    <div className="space-y-3 pr-6">
      <div className="flex items-center gap-2">
        <Footprints className="w-4 h-4 text-amber-400" />
        <h3 className="font-semibold">Walked Boundary</h3>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-sm">
        <div className="text-muted-foreground text-xs mb-1">Area</div>
        <div className="font-bold text-primary text-lg">{fmtArea(result.sqFt)}</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
        <div className="font-medium text-muted-foreground mb-1">🛍️ Mulch needed</div>
        <div>2&quot; depth: <span className="text-foreground font-medium">{result.mulchBags2in} bags</span></div>
        <div>3&quot; depth: <span className="text-foreground font-medium">{result.mulchBags3in} bags</span> / {result.mulchCuYd} cu yd</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
        <div className="font-medium text-muted-foreground mb-1">🌱 Plant spacing</div>
        <div>12&quot; spacing: <span className="text-foreground font-medium">{result.plantsAt12in} plants</span></div>
        <div>18&quot; spacing: <span className="text-foreground font-medium">{result.plantsAt18in} plants</span></div>
        <div>24&quot; spacing: <span className="text-foreground font-medium">{result.plantsAt24in} plants</span></div>
      </div>
    </div>
  );
}

function ZoneFallbackList() {
  return (
    <div className="w-full max-w-sm mt-4">
      <h3 className="text-sm font-medium mb-2 text-muted-foreground">Your Zones</h3>
      <div className="grid gap-2">
        {mockZones.map(zone => (
          <div key={zone.id} className="flex items-center gap-2 p-2 bg-card border border-border rounded-lg">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: zone.color }} />
            <span className="text-sm font-medium">{zone.name}</span>
            <Badge variant="outline" className="ml-auto text-xs capitalize">{zone.type.replace("_", " ")}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
