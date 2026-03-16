"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin, Layers, X, Navigation, Ruler, Map as MapIcon,
  Satellite, Eye, EyeOff, Camera, Plus, Leaf, CheckSquare,
  Footprints, Calculator, ChevronDown, ChevronUp, Loader2,
  AlertCircle, ZapIcon, PenLine, Check, Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getZones, createZone, updateZone, deleteZone, getPlants, fetchParcelBoundary, getProperty } from "@/lib/data";
import { polylineDistanceFt, polygonAreaSqFt, fmtFt, fmtM, fmtArea, mulchBags, mulchCuYd, plantCount } from "@/lib/geo";
import { extractExifGps, createPhotoUrl } from "@/lib/exif";
import { identifyPlant, diagnoseHealth } from "@/lib/ai-plant";

const BOISE_COORDS: [number, number] = [-116.163076, 43.575335];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type MapMode = "view" | "measure" | "boundary-walk" | "draw-zone";
type MapLayer = "zones" | "plants" | "tasks" | "photos" | "measurements";
type BaseStyle = "satellite" | "satellite-clean" | "streets" | "outdoors" | "light";

const STYLES: Record<BaseStyle, string> = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",      // Satellite + labels
  "satellite-clean": "mapbox://styles/mapbox/satellite-v9",        // Satellite only, no labels (older, sometimes sharper locally)
  streets: "mapbox://styles/mapbox/dark-v11",                      // Dark street map
  outdoors: "mapbox://styles/mapbox/outdoors-v12",                 // Topo / outdoors
  light: "mapbox://styles/mapbox/light-v11",                       // Light street map
};

const STYLE_LABELS: Record<BaseStyle, string> = {
  satellite: "Sat+Labels",
  "satellite-clean": "Satellite",
  streets: "Dark",
  outdoors: "Topo",
  light: "Light",
};

const ZONE_TYPES = [
  { value: "lawn", label: "Lawn" },
  { value: "garden_bed", label: "Garden Bed" },
  { value: "hardscape", label: "Hardscape" },
  { value: "driveway", label: "Driveway" },
  { value: "fence", label: "Fence Line" },
  { value: "irrigation", label: "Irrigation" },
  { value: "tree", label: "Tree / Shrub" },
  { value: "vegetable", label: "Vegetable Garden" },
  { value: "path", label: "Path / Walkway" },
  { value: "structure", label: "Structure / Building" },
  { value: "other", label: "Other" },
];

const ZONE_COLORS = [
  "#4ade80", "#a78bfa", "#38bdf8", "#fb923c",
  "#f472b6", "#facc15", "#94a3b8", "#f87171",
];

interface DbZone {
  id: string;
  property_id: string;
  name: string;
  type: string;
  color: string;
  geojson: object | null;
  notes: string | null;
}

interface DbPlant {
  id: string;
  zone_id: string | null;
  name: string;
  species: string | null;
  status: "healthy" | "needs_attention" | "dead";
  notes: string | null;
}

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
  sampling: boolean;
  currentPos: [number, number] | null;
  rectMode: boolean; // 2-point rectangle mode
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

interface DrawZoneForm {
  name: string;
  type: string;
  color: string;
  notes: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildZoneFeaturesFromDb(zones: DbZone[]) {
  const base = BOISE_COORDS;
  const offset = 0.0003;
  return zones.map((zone, i) => {
    // If zone has saved geojson, use it; otherwise generate placeholder
    if (zone.geojson) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geo = zone.geojson as any;
      const coords = geo.coordinates?.[0] || [];
      const sqFt = polygonAreaSqFt(coords.slice(0, -1));
      return {
        type: "Feature" as const,
        properties: { id: zone.id, name: zone.name, type: zone.type, color: zone.color, sqFt },
        geometry: geo,
      };
    }
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
  const drawMarkersRef = useRef<unknown[]>([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [parcelGeo, setParcelGeo] = useState<{type:string; coordinates: number[][][]} | null>(null);
  // -2.2m west = -0.00002 lng (calibrated to satellite imagery 2026-03-16)
  const [parcelOffset, setParcelOffset] = useState({ lng: -0.00002, lat: 0 });
  const [showParcelOffset, setShowParcelOffset] = useState(false);
  const [noToken, setNoToken] = useState(false);
  const [mode, setMode] = useState<MapMode>("view");
  const [baseStyle, setBaseStyle] = useState<BaseStyle>("satellite");
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
    zones: true, plants: true, tasks: false, photos: true, measurements: true,
  });

  // Data from Supabase
  const [zones, setZones] = useState<DbZone[]>([]);
  const [plants, setPlants] = useState<DbPlant[]>([]);

  const [selected, setSelected] = useState<{ type: "zone" | "plant"; id: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Measurements
  const [measureCoords, setMeasureCoords] = useState<[number, number][]>([]);
  const [measurements, setMeasurements] = useState<MeasurementLine[]>([]);

  // Boundary walk
  const [walk, setWalk] = useState<WalkBoundary>({ coords: [], active: false, watchId: null, sampling: false, currentPos: null, rectMode: true });
  const [walkArea, setWalkArea] = useState<ZoneCalcResult | null>(null);
  const [walkCoords, setWalkCoords] = useState<[number, number][]>([]);
  const [walkTargetZoneId, setWalkTargetZoneId] = useState<string | null>(null);

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

  // Zone drawing state
  const [showDrawForm, setShowDrawForm] = useState(false);
  const [drawForm, setDrawForm] = useState<DrawZoneForm>({ name: "", type: "garden_bed", color: "#4ade80", notes: "" });
  const [drawCoords, setDrawCoords] = useState<[number, number][]>([]);
  const [savingZone, setSavingZone] = useState(false);

  // Keep drawCoords accessible in map event handlers via ref
  const drawCoordsRef = useRef<[number, number][]>([]);
  drawCoordsRef.current = drawCoords;
  const drawFormRef = useRef<DrawZoneForm>(drawForm);
  drawFormRef.current = drawForm;
  const modeRef = useRef<MapMode>(mode);
  modeRef.current = mode;

  // ── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getZones(), getPlants()]).then(([z, p]) => {
      setZones(z as DbZone[]);
      setPlants(p as DbPlant[]);
    });
  }, []);

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
      if (cancelled) return;

      mapboxRef.current = mapboxgl;
      (mapboxgl as { accessToken: string }).accessToken = MAPBOX_TOKEN;

      const m = new mapboxgl.Map({
        container: mapContainer.current!,
        style: STYLES[baseStyle],
        center: BOISE_COORDS,
        zoom: 19,
        pitchWithRotate: false,
      });
      mapRef.current = m;

      m.on("load", () => {
        if (cancelled) return;
        setMapLoaded(true);
      });
    };

    init();
    return () => { cancelled = true; mapRef.current?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── add zone layers when map+data ready ───────────────────────────────────

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded || zones.length === 0) return;
    addZoneLayers(m, zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, zones]);

  // ── add plant markers when map+data ready ────────────────────────────────

  useEffect(() => {
    const m = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!m || !mapLoaded || !mapboxgl || plants.length === 0) return;
    addPlantMarkers(m, mapboxgl, plants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, plants]);

  // ── refresh zone layer when zones list changes ────────────────────────────

  const refreshZoneLayers = useCallback((updatedZones: DbZone[]) => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    const src = m.getSource("zones");
    if (src) {
      src.setData({ type: "FeatureCollection", features: buildZoneFeaturesFromDb(updatedZones) });
    } else {
      addZoneLayers(m, updatedZones);
    }
  }, [mapLoaded]);

  // ── measured property boundary (from Supabase) ───────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    getProperty().then(prop => {
      if (!prop?.boundary_geojson || m.getSource("property-boundary")) return;
      m.addSource("property-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: prop.boundary_geojson as never } });
      m.addLayer({ id: "property-boundary-line", type: "line", source: "property-boundary", paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 0.9 } });
    });
  }, [mapLoaded]);

  // ── parcel boundary overlay ───────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    fetchParcelBoundary(BOISE_COORDS[0], BOISE_COORDS[1]).then(geo => {
      if (!geo) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setParcelGeo(geo as any);
      if (m.getSource("parcel")) return;
      m.addSource("parcel", { type: "geojson", data: { type: "Feature", properties: {}, geometry: geo as never } });
      m.addLayer({ id: "parcel-border", type: "line", source: "parcel", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [4, 2], "line-opacity": 0.8 } });
      m.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": "#ffffff", "fill-opacity": 0.04 } });
    });
  }, [mapLoaded]);

  // ── apply parcel offset ───────────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !parcelGeo) return;
    const src = m.getSource("parcel");
    if (!src) return;
    const shifted = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        ...parcelGeo,
        coordinates: parcelGeo.coordinates.map((ring: number[][]) =>
          ring.map((pt: number[]) => [pt[0] + parcelOffset.lng, pt[1] + parcelOffset.lat])
        ),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (src as any).setData(shifted);
  }, [parcelOffset, parcelGeo]);

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
      if (zones.length > 0) addZoneLayers(m, zones);
      // Re-add property boundary
      getProperty().then(prop => {
        if (!prop?.boundary_geojson || m.getSource("property-boundary")) return;
        m.addSource("property-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: prop.boundary_geojson as never } });
        m.addLayer({ id: "property-boundary-line", type: "line", source: "property-boundary", paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 0.9 } });
      });
      // Re-add parcel overlay
      if (parcelGeo) {
        const shifted = { type: "Feature" as const, properties: {}, geometry: { ...parcelGeo, coordinates: parcelGeo.coordinates.map((ring: number[][]) => ring.map((pt: number[]) => [pt[0] + parcelOffset.lng, pt[1] + parcelOffset.lat])) } };
        if (!m.getSource("parcel")) {
          m.addSource("parcel", { type: "geojson", data: shifted });
          m.addLayer({ id: "parcel-border", type: "line", source: "parcel", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [4, 2], "line-opacity": 0.8 } });
          m.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": "#ffffff", "fill-opacity": 0.04 } });
        }
      }
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
      const currentMode = modeRef.current;

      if (currentMode === "measure") {
        setMeasureCoords(prev => {
          const next = [...prev, pt];
          drawMeasureLine(m, next);
          return next;
        });
      } else if (currentMode === "draw-zone") {
        // Add vertex
        const newCoords = [...drawCoordsRef.current, pt];
        setDrawCoords(newCoords);
        updateDrawPreview(m, newCoords, drawFormRef.current.color);
        addDrawVertex(m, pt);
      }
    };

    const handleDblClick = (e: { lngLat: { lng: number; lat: number }; preventDefault: () => void }) => {
      if (modeRef.current === "draw-zone") {
        e.preventDefault();
        // finish zone on double-click
        finishZoneDrawing();
      }
    };

    m.on("click", handleClick);
    m.on("dblclick", handleDblClick);
    return () => {
      m.off("click", handleClick);
      m.off("dblclick", handleDblClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // Update preview color when form changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded || mode !== "draw-zone") return;
    updateDrawPreview(m, drawCoords, drawForm.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawForm.color]);

  // ── helpers: add layers ───────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addZoneLayers(m: any, dbZones: DbZone[]) {
    const features = buildZoneFeaturesFromDb(dbZones);
    const geojson = { type: "FeatureCollection", features };

    if (!m.getSource("zones")) {
      m.addSource("zones", { type: "geojson", data: geojson });
    } else {
      m.getSource("zones").setData(geojson);
    }

    if (!m.getLayer("zones-fill")) {
      m.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 } });
    }
    if (!m.getLayer("zones-border")) {
      m.addLayer({ id: "zones-border", type: "line", source: "zones", paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.8 } });
    }
    if (!m.getLayer("zones-label")) {
      m.addLayer({ id: "zones-label", type: "symbol", source: "zones", layout: { "text-field": ["get", "name"], "text-size": 11, "text-anchor": "center" }, paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1 } });
    }

    m.on("click", "zones-fill", (e: { features?: { properties?: { id?: string } }[] }) => {
      const id = e.features?.[0]?.properties?.id;
      if (id && modeRef.current === "view") setSelected({ type: "zone", id });
    });
    m.on("mouseenter", "zones-fill", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "zones-fill", () => { m.getCanvas().style.cursor = ""; });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addPlantMarkers(m: any, mapboxgl: any, dbPlants: DbPlant[]) {
    dbPlants.forEach((plant, i) => {
      // Use geojson if available, else scatter around center
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

      new mapboxgl.Marker({ element: el }).setLngLat([cx, cy]).addTo(m);
    });
  }

  // ── Draw-zone helpers ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateDrawPreview(m: any, coords: [number, number][], color: string) {
    if (coords.length < 2) return;

    const closedCoords = coords.length >= 3
      ? [...coords, coords[0]]
      : [...coords, coords[coords.length - 1]];

    const lineData = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: { type: coords.length >= 3 ? "Polygon" : "LineString", coordinates: coords.length >= 3 ? [closedCoords] : coords },
      }],
    };

    const src = m.getSource("draw-preview");
    if (src) {
      src.setData(lineData);
    } else {
      m.addSource("draw-preview", { type: "geojson", data: lineData });
      m.addLayer({
        id: "draw-preview-fill",
        type: "fill",
        source: "draw-preview",
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": color, "fill-opacity": 0.25 },
      });
      m.addLayer({
        id: "draw-preview-line",
        type: "line",
        source: "draw-preview",
        paint: { "line-color": color, "line-width": 2.5, "line-dasharray": [3, 1.5] },
      });
    }

    // Update fill color dynamically
    if (m.getLayer("draw-preview-fill")) {
      m.setPaintProperty("draw-preview-fill", "fill-color", color);
    }
    if (m.getLayer("draw-preview-line")) {
      m.setPaintProperty("draw-preview-line", "line-color", color);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addDrawVertex(m: any, coord: [number, number]) {
    const mapboxgl = mapboxRef.current;
    if (!mapboxgl) return;
    const el = document.createElement("div");
    el.style.cssText = `
      width: 10px; height: 10px; border-radius: 50%;
      background: white; border: 2px solid #4ade80;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
    `;
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(m);
    drawMarkersRef.current.push(marker);
  }

  function clearDrawLayers() {
    const m = mapRef.current;
    if (!m) return;
    ["draw-preview-fill", "draw-preview-line"].forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id);
    });
    if (m.getSource("draw-preview")) m.removeSource("draw-preview");
    (drawMarkersRef.current as { remove: () => void }[]).forEach(mk => mk.remove());
    drawMarkersRef.current = [];
  }

  const startZoneDrawing = () => {
    setDrawCoords([]);
    setMode("draw-zone");
    const m = mapRef.current;
    if (m) m.getCanvas().style.cursor = "crosshair";
  };

  const cancelZoneDrawing = useCallback(() => {
    setMode("view");
    setDrawCoords([]);
    clearDrawLayers();
    const m = mapRef.current;
    if (m) m.getCanvas().style.cursor = "";
  }, []);

  const finishZoneDrawing = useCallback(async () => {
    const coords = drawCoordsRef.current;
    if (coords.length < 3) {
      alert("Draw at least 3 points to create a zone.");
      return;
    }

    setSavingZone(true);
    const form = drawFormRef.current;

    // Close the polygon
    const closedRing: [number, number][] = [...coords, coords[0]];
    const geojson = {
      type: "Polygon",
      coordinates: [closedRing],
    };

    try {
      const newZone = await createZone({
        name: form.name || "Unnamed Zone",
        type: form.type,
        color: form.color,
        geojson,
        notes: form.notes || null,
      });

      const updatedZones = [...zones, newZone as DbZone];
      setZones(updatedZones);
      refreshZoneLayers(updatedZones);
    } catch (err) {
      console.error("Failed to save zone:", err);
      alert("Failed to save zone. Check console for details.");
    } finally {
      setSavingZone(false);
      setMode("view");
      setDrawCoords([]);
      setShowDrawForm(false);
      clearDrawLayers();
      const m = mapRef.current;
      if (m) m.getCanvas().style.cursor = "";
    }
  }, [zones, refreshZoneLayers]);

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

          if (userMarkerRef.current) (userMarkerRef.current as { remove: () => void }).remove();

          const el = document.createElement("div");
          el.style.cssText = `
            width: 20px; height: 20px; border-radius: 50%;
            background: #3b82f6; border: 3px solid white;
            box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
          `;
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

  // ── Boundary walk (corner-tap mode) ────────────────────────────────────────

  const startWalk = useCallback(() => {
    setWalk(prev => ({ coords: [], active: true, watchId: null, sampling: false, currentPos: null, rectMode: prev.rectMode }));
    setMode("boundary-walk");
    // Watch position continuously just to show live dot on map
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const m = mapRef.current;
        const mapboxgl = mapboxRef.current;
        setWalk(prev => {
          if (m && mapboxgl) {
            if (walkMarkerRef.current) (walkMarkerRef.current as { setLngLat: (c: [number,number]) => void }).setLngLat(pt);
            else {
              const el = document.createElement("div");
              el.style.cssText = `width:14px;height:14px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 0 8px rgba(245,158,11,0.8);`;
              walkMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(pt).addTo(m);
            }
          }
          return { ...prev, currentPos: pt, watchId: id };
        });
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 500 }
    );
  }, []);

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Mark a point — collect samples until accuracy < 6m or max 5s, filter outliers
  const markCorner = useCallback(() => {
    setWalk(prev => ({ ...prev, sampling: true }));
    const samples: { lng: number; lat: number; acc: number }[] = [];
    let done = false;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        setGpsAccuracy(Math.round(acc));
        samples.push({ lng: pos.coords.longitude, lat: pos.coords.latitude, acc });
        // Accept once we have a good reading (acc < 6m) and at least 3 samples
        if (!done && acc < 6 && samples.length >= 3) {
          done = true;
          navigator.geolocation.clearWatch(id);
          finish(samples);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // Force finish after 5s even if accuracy isn't great
    setTimeout(() => {
      if (!done) {
        done = true;
        navigator.geolocation.clearWatch(id);
        finish(samples);
      }
    }, 5000);

    function finish(s: typeof samples) {
      if (s.length === 0) { setWalk(prev => ({ ...prev, sampling: false })); return; }
      // Sort by accuracy, take best half
      const sorted = [...s].sort((a, b) => a.acc - b.acc);
      const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
      // Average the best readings
      const avgLng = best.reduce((sum, p) => sum + p.lng, 0) / best.length;
      const avgLat = best.reduce((sum, p) => sum + p.lat, 0) / best.length;
      const pt: [number, number] = [avgLng, avgLat];
      setWalk(prev => {
        const coords = [...prev.coords, pt];
        const m = mapRef.current;
        const mapboxgl = mapboxRef.current;
        if (m && mapboxgl) {
          // Add corner marker
          const el = document.createElement("div");
          el.style.cssText = `width:12px;height:12px;border-radius:50%;background:white;border:2px solid #f59e0b;`;
          new mapboxgl.Marker({ element: el }).setLngLat(pt).addTo(m);
          // Update line
          if (coords.length > 1) {
            const data = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] };
            const src = m.getSource("walk-line");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (src) (src as any).setData(data);
            else {
              m.addSource("walk-line", { type: "geojson", data });
              m.addLayer({ id: "walk-line", type: "line", source: "walk-line", paint: { "line-color": "#f59e0b", "line-width": 2, "line-dasharray": [2, 1] } });
            }
          }
        }
        const isRect = prev.rectMode;
        // In rect mode: build rectangle from 2 opposite corners
        let previewCoords = coords;
        if (isRect && coords.length === 2) {
          const [a, b] = coords;
          previewCoords = [[a[0],a[1]], [b[0],a[1]], [b[0],b[1]], [a[0],b[1]], [a[0],a[1]]];
        }
        if (m && mapboxgl) {
          // Update preview polygon
          if (previewCoords.length >= 3) {
            const closed = previewCoords[previewCoords.length-1][0] === previewCoords[0][0]
              ? previewCoords : [...previewCoords, previewCoords[0]];

            const src = m.getSource("walk-line");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (src) (src as any).setData({ type:"FeatureCollection", features:[{ type:"Feature", properties:{}, geometry:{type:"LineString",coordinates:closed}}]});
            else {
              m.addSource("walk-line", { type: "geojson", data: { type:"FeatureCollection", features:[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:closed}}]}});
              m.addLayer({ id: "walk-line", type: "line", source: "walk-line", paint: { "line-color": "#f59e0b", "line-width": 2, "line-dasharray": [2,1] } });
            }
          }
        }
        return { ...prev, coords, sampling: false };
      });
      setGpsAccuracy(null);
    }
  }, []);

  const stopWalk = useCallback(() => {
    setWalk(prev => {
      if (prev.watchId !== null) navigator.geolocation.clearWatch(prev.watchId);
      // Expand 2-point rect to full polygon
      let finalCoords = prev.coords;
      if (prev.rectMode && prev.coords.length === 2) {
        const [a, b] = prev.coords;
        finalCoords = [[a[0],a[1]], [b[0],a[1]], [b[0],b[1]], [a[0],b[1]]];
      }
      const sqFt = polygonAreaSqFt(finalCoords);
      setWalkArea({
        sqFt,
        mulchBags2in: mulchBags(sqFt, 2),
        mulchBags3in: mulchBags(sqFt, 3),
        mulchCuYd: mulchCuYd(sqFt, 3),
        plantsAt12in: plantCount(sqFt, 12),
        plantsAt18in: plantCount(sqFt, 18),
        plantsAt24in: plantCount(sqFt, 24),
      });
      setWalkCoords(finalCoords);
      const m = mapRef.current;
      if (m && prev.coords.length > 2) {
        const closedCoords = [...prev.coords, prev.coords[0]];
        const data = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closedCoords] } }],
        };
        const src = m.getSource("walk-polygon");
        if (src) src.setData(data);
        else {
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
      features: coords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] : [],
    };
    const src = m.getSource("measure-line");
    if (src) src.setData(data);
    else {
      m.addSource("measure-line", { type: "geojson", data });
      m.addLayer({ id: "measure-line", type: "line", source: "measure-line", paint: { "line-color": "#a855f7", "line-width": 2, "line-dasharray": [3, 1] } });
    }
    const mapboxgl = mapboxRef.current;
    if (!mapboxgl) return;
    const el = document.createElement("div");
    el.style.cssText = "width:8px;height:8px;border-radius:50%;background:#a855f7;border:2px solid white;";
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coords[coords.length - 1]).addTo(m);
    (measureMarkersRef.current as unknown[]).push(marker);
  }

  const finishMeasure = () => {
    if (measureCoords.length < 2) { setMeasureCoords([]); setMode("view"); return; }
    const ft = polylineDistanceFt(measureCoords);
    setMeasurements(prev => [...prev, { id: `m${Date.now()}`, coords: measureCoords, distanceFt: ft, distanceM: ft / 3.28084 }]);
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
    if (exif) { lng = exif.lng; lat = exif.lat; hasExifGps = true; }
    else {
      const m = mapRef.current;
      if (m) { const c = m.getCenter(); lng = c.lng; lat = c.lat; }
    }
    const pin: PhotoPin = { id: `ph${Date.now()}`, url, lng, lat, label, hasExifGps };
    setPhotos(prev => [...prev, pin]);
    const mapboxgl = mapboxRef.current;
    const m = mapRef.current;
    if (mapboxgl && m) {
      const el = document.createElement("div");
      el.className = "photo-marker";
      el.style.cssText = `width:32px;height:32px;border-radius:8px;background:#1e293b;border:2px solid #a855f7;cursor:pointer;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
      const img = document.createElement("img");
      img.src = url; img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      el.appendChild(img);
      el.addEventListener("click", () => setShowPhotoModal(pin));
      new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
      if (hasExifGps) m.flyTo({ center: [lng, lat], zoom: 18 });
    }
  }, []);

  // ── AI identification ─────────────────────────────────────────────────────

  const runAiIdentify = useCallback(async (file: File, aiMode: "identify" | "diagnose", plantName?: string) => {
    setAiLoading(true);
    setAiResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (aiMode === "identify") {
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

  const selectedZone = selected?.type === "zone" ? zones.find(z => z.id === selected.id) : null;
  const selectedPlant = selected?.type === "plant" ? plants.find(p => p.id === selected.id) : null;
  const selectedZoneFeature = selectedZone
    ? buildZoneFeaturesFromDb(zones).find(f => f.properties.id === selectedZone.id)
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
        </div>
        <ZoneFallbackList zones={zones} />
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
        <div className="pointer-events-auto flex flex-col gap-1">
          <div className="flex gap-1 flex-wrap max-w-xs">
            {(["satellite", "satellite-clean", "outdoors", "streets", "light"] as BaseStyle[]).map(s => (
              <button
                key={s}
                onClick={() => setBaseStyle(s)}
                className={`px-2 py-1 text-xs rounded-md border font-medium transition-colors ${
                  baseStyle === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white border-white/20 hover:bg-black/80"
                }`}
              >
                {s.startsWith("satellite") ? <Satellite className="w-3 h-3 inline mr-1" /> : <MapIcon className="w-3 h-3 inline mr-1" />}
                {STYLE_LABELS[s]}
              </button>
            ))}
          </div>

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
              {parcelGeo && (
                <div className="border-t border-white/20 pt-1 mt-1">
                  <button
                    onClick={() => setShowParcelOffset(v => !v)}
                    className="text-white/60 hover:text-white flex items-center gap-1"
                  >
                    ⊞ Align parcel line
                  </button>
                  {showParcelOffset && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-white/50 w-6">E/W</span>
                        <button onClick={() => setParcelOffset(p => ({ ...p, lng: p.lng - 0.00001 }))} className="px-1 bg-white/10 rounded">◀</button>
                        <span className="w-12 text-center">{(parcelOffset.lng * 111000).toFixed(1)}m</span>
                        <button onClick={() => setParcelOffset(p => ({ ...p, lng: p.lng + 0.00001 }))} className="px-1 bg-white/10 rounded">▶</button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-white/50 w-6">N/S</span>
                        <button onClick={() => setParcelOffset(p => ({ ...p, lat: p.lat - 0.00001 }))} className="px-1 bg-white/10 rounded">▼</button>
                        <span className="w-12 text-center">{(parcelOffset.lat * 111000).toFixed(1)}m</span>
                        <button onClick={() => setParcelOffset(p => ({ ...p, lat: p.lat + 0.00001 }))} className="px-1 bg-white/10 rounded">▲</button>
                      </div>
                      <button onClick={() => setParcelOffset({ lng: 0, lat: 0 })} className="text-white/40 hover:text-white">Reset</button>
                    </div>
                  )}
                </div>
              )}
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

      {/* ── Draw Zone Form overlay ── */}
      {showDrawForm && mode !== "draw-zone" && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none z-20">
          <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <PenLine className="w-4 h-4 text-primary" /> New Zone
              </h3>
              <button onClick={() => setShowDrawForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Zone Name</Label>
                <Input
                  value={drawForm.name}
                  onChange={e => setDrawForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Front Garden Bed"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Type</Label>
                <Select value={drawForm.type} onValueChange={v => setDrawForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {ZONE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setDrawForm(p => ({ ...p, color: c }))}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        drawForm.color === c ? "border-white scale-110" : "border-transparent"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-2 h-12 text-base"
                onClick={() => {
                  if (!drawForm.name.trim()) {
                    setDrawForm(p => ({ ...p, name: "My Zone" }));
                  }
                  startZoneDrawing();
                }}
              >
                <PenLine className="w-5 h-5" />
                Start Drawing
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Tap points on the map to draw your zone. Double-tap or press Finish to save.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Draw-zone active controls ── */}
      {mode === "draw-zone" && (
        <>
          {/* Top hint banner */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-green-900/95 border border-green-500 text-white text-sm px-4 py-2.5 rounded-full flex items-center gap-2 pointer-events-none shadow-lg z-10">
            <PenLine className="w-4 h-4" />
            {drawCoords.length === 0
              ? "Tap map to place first point"
              : drawCoords.length < 3
              ? `${drawCoords.length} point${drawCoords.length !== 1 ? "s" : ""} — need ${3 - drawCoords.length} more`
              : `${drawCoords.length} points — tap Finish or double-tap`}
          </div>

          {/* Bottom draw controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-auto z-10">
            <button
              onClick={cancelZoneDrawing}
              className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-black/80 border border-white/30 text-white text-sm font-medium shadow-xl active:scale-95 transition-transform"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={finishZoneDrawing}
              disabled={drawCoords.length < 3 || savingZone}
              className={`flex items-center gap-2 px-6 py-3.5 rounded-full text-white text-sm font-semibold shadow-xl active:scale-95 transition-all ${
                drawCoords.length >= 3 && !savingZone
                  ? "bg-green-600 border-2 border-green-400"
                  : "bg-green-900/50 border border-green-800/50 opacity-60"
              }`}
            >
              {savingZone
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4" /> Finish Zone</>}
            </button>
          </div>

          {/* Undo last point */}
          {drawCoords.length > 0 && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto z-10">
              <button
                onClick={() => {
                  const newCoords = drawCoords.slice(0, -1);
                  setDrawCoords(newCoords);
                  // Remove last vertex marker
                  const markers = drawMarkersRef.current as { remove: () => void }[];
                  const last = markers.pop();
                  if (last) last.remove();
                  // Update preview
                  const m = mapRef.current;
                  if (m) {
                    if (newCoords.length < 2) {
                      ["draw-preview-fill", "draw-preview-line"].forEach(id => {
                        if (m.getLayer(id)) m.removeLayer(id);
                      });
                      if (m.getSource("draw-preview")) m.removeSource("draw-preview");
                    } else {
                      updateDrawPreview(m, newCoords, drawForm.color);
                    }
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-black/70 border border-white/20 text-white text-xs shadow-lg active:scale-95 transition-transform"
              >
                ↩ Undo point
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Mode toolbar (bottom-center) — hidden during draw-zone ── */}
      {mode !== "draw-zone" && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
          {/* Add Zone button */}
          <button
            onClick={() => {
              setShowDrawForm(true);
              setSelected(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border shadow-lg transition-colors bg-green-700 text-white border-green-500 hover:bg-green-600"
          >
            <PenLine className="w-4 h-4" /> Add Zone
          </button>
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
          {/* GPS walk removed — not accurate enough for residential use */}
        </div>
      )}

      {/* ── GPS + FAB buttons (bottom-right) — hidden during draw-zone ── */}
      {mode !== "draw-zone" && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
          {showFab && (
            <div className="flex flex-col gap-2 items-end mb-1">
              <FabSubButton icon={<Leaf className="w-4 h-4" />} label="Add Plant" href="/plants" color="bg-green-600" />
              <FabSubButton icon={<CheckSquare className="w-4 h-4" />} label="Add Task" href="/tasks" color="bg-blue-600" />
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-lg border border-white/20">Take Photo</span>
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shadow-lg">
                  <Camera className="w-4 h-4 text-white" />
                </div>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f, f.name); setShowFab(false); }} />
              </label>
            </div>
          )}

          <button
            onClick={goToMyLocation}
            disabled={gpsLoading}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl border-2 transition-colors ${
              gpsLoading ? "bg-blue-400 border-blue-300" : "bg-blue-600 hover:bg-blue-500 border-blue-400"
            }`}
            title="My Location"
          >
            {gpsLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Navigation className="w-5 h-5 text-white" />}
          </button>

          <button
            onClick={() => setShowFab(v => !v)}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-2 transition-all ${
              showFab ? "bg-red-600 border-red-400 rotate-45" : "bg-primary hover:bg-primary/90 border-primary/50"
            }`}
          >
            <Plus className="w-6 h-6 text-primary-foreground" />
          </button>
        </div>
      )}

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
      {false && mode === "boundary-walk" && walk.active && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center gap-2 pointer-events-auto px-4 z-30">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-black/70 rounded-lg p-1 border border-white/20 text-xs">
            <button
              onClick={() => setWalk(p => ({ ...p, coords: [], rectMode: true }))}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${walk.rectMode ? "bg-amber-500 text-white" : "text-white/60 hover:text-white"}`}
            >⬜ Rectangle (2 pts)</button>
            <button
              onClick={() => setWalk(p => ({ ...p, coords: [], rectMode: false }))}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${!walk.rectMode ? "bg-amber-500 text-white" : "text-white/60 hover:text-white"}`}
            >〰 Freeform</button>
          </div>
          <div className="bg-amber-900/90 border border-amber-500 text-white text-xs px-3 py-2 rounded-lg text-center w-full">
            <Footprints className="w-4 h-4 inline mr-1" />
            {walk.sampling
              ? `Sampling GPS… ${gpsAccuracy !== null ? `±${gpsAccuracy}m` : ""}`
              : walk.rectMode
                ? walk.coords.length === 0
                  ? `Walk to one corner, tap Mark Point${gpsAccuracy !== null ? ` (GPS: ±${gpsAccuracy}m)` : ""}`
                  : `Walk to opposite corner, tap Mark Point${gpsAccuracy !== null ? ` (±${gpsAccuracy}m)` : ""}`
                : walk.coords.length === 0
                  ? `Walk to a point, tap Mark Point${gpsAccuracy !== null ? ` (±${gpsAccuracy}m)` : ""}`
                  : `${walk.coords.length} point${walk.coords.length === 1 ? "" : "s"} marked${gpsAccuracy !== null ? ` · ±${gpsAccuracy}m` : ""}`}
          </div>
          <div className="flex gap-2 w-full">
            <button
              onClick={markCorner}
              disabled={walk.sampling || (walk.rectMode && walk.coords.length >= 2)}
              className={`flex-1 py-4 rounded-xl font-bold text-base shadow-xl border-2 transition-all active:scale-95 ${
                walk.sampling ? "bg-amber-400 border-amber-300 text-amber-900"
                : (walk.rectMode && walk.coords.length >= 2) ? "bg-gray-600 border-gray-500 text-gray-400"
                : "bg-amber-500 border-amber-300 text-white"
              }`}
            >
              {walk.sampling ? "⏳ Sampling GPS…" : "📍 Mark Point Here"}
            </button>
            {(walk.rectMode ? walk.coords.length >= 2 : walk.coords.length >= 3) && (
              <button
                onClick={stopWalk}
                className="flex-1 py-4 rounded-xl font-bold text-base shadow-xl border-2 bg-green-600 border-green-400 text-white active:scale-95"
              >
                ✅ Finish
              </button>
            )}
            <button
              onClick={() => { if (walk.watchId !== null) navigator.geolocation.clearWatch(walk.watchId); setWalk(p => ({ ...p, active: false, coords: [] })); setMode("view"); }}
              className="px-3 py-3 rounded-xl text-sm shadow-xl border-2 bg-black/60 border-white/20 text-white hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Zone detail panel ── */}
      {selectedZone && (
        <SidePanel onClose={() => setSelected(null)}>
          <ZonePanel
            zone={selectedZone}
            plants={plants}
            sqFt={zoneSqFt}
            calcDepth={calcDepth}
            setCalcDepth={setCalcDepth}
            calcSpacing={calcSpacing}
            setCalcSpacing={setCalcSpacing}
            onUpdate={async (id, updates) => {
              await updateZone(id, updates);
              setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
            }}
            onDelete={async (id) => {
              await deleteZone(id);
              setZones(prev => prev.filter(z => z.id !== id));
              setSelected(null);
            }}
            onRedrawBoundary={(zoneId) => {
              setWalkTargetZoneId(zoneId);
              setSelected(null);
              startWalk();
            }}
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
        <SidePanel onClose={() => { setWalkArea(null); setWalkTargetZoneId(null); }}>
          <WalkResultPanel
            result={walkArea}
            zones={zones}
            targetZoneId={walkTargetZoneId}
            onSaveToZone={async (zoneId) => {
              if (walkCoords.length < 3) return;
              const closed = [...walkCoords, walkCoords[0]];
              const geojson = { type: "Polygon", coordinates: [closed] };
              await updateZone(zoneId, { geojson });
              setZones(prev => prev.map(z => z.id === zoneId ? { ...z, geojson } : z));
              setWalkArea(null);
              setWalkTargetZoneId(null);
            }}
          />
        </SidePanel>
      )}

      {/* ── Photo modal ── */}
      {showPhotoModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4 pointer-events-auto"
          onClick={() => setShowPhotoModal(null)}>
          <div className="relative max-w-md w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowPhotoModal(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10">
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
    <div className="absolute bottom-4 left-4 right-4 md:right-auto md:left-4 md:w-80 bg-card border border-border rounded-xl shadow-2xl p-4 pointer-events-auto max-h-[60vh] overflow-y-auto z-10">
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

function ZonePanel({ zone, plants, sqFt, calcDepth, setCalcDepth, calcSpacing, setCalcSpacing, onUpdate, onDelete, onRedrawBoundary }: {
  zone: DbZone; plants: DbPlant[]; sqFt: number;
  calcDepth: number; setCalcDepth: (v: number) => void;
  calcSpacing: number; setCalcSpacing: (v: number) => void;
  onUpdate: (id: string, updates: Partial<DbZone>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRedrawBoundary: (zoneId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: zone.name, type: zone.type, color: zone.color, notes: zone.notes || "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const zonePlants = plants.filter(p => p.zone_id === zone.id);
  const cuYd = mulchCuYd(sqFt, calcDepth);
  const numPlants = plantCount(sqFt, calcSpacing);

  async function handleSave() {
    setSaving(true);
    await onUpdate(zone.id, editForm);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 pr-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Edit Zone</h3>
          <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={editForm.type} onValueChange={v => setEditForm(p => ({ ...p, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ZONE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Color</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {ZONE_COLORS.map(c => (
              <button key={c} onClick={() => setEditForm(p => ({ ...p, color: c }))}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${editForm.color === c ? "border-white scale-110" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea value={editForm.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm(p => ({ ...p, notes: e.target.value }))} className="mt-1 text-sm" rows={2} />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Changes"}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pr-6">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm" style={{ background: zone.color }} />
        <h3 className="font-semibold">{zone.name}</h3>
        <Badge variant="outline" className="text-xs capitalize ml-auto">{zone.type.replace("_", " ")}</Badge>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => setEditing(true)}>
          <PenLine className="w-3 h-3" /> Edit
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => onRedrawBoundary(zone.id)}>
          <Footprints className="w-3 h-3" /> Redraw
        </Button>
        {confirmDelete ? (
          <div className="flex gap-1 w-full">
            <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={() => onDelete(zone.id)}>Delete</Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-400/30 hover:bg-red-400/10" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>

      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Calculator className="w-3.5 h-3.5" /> Area
          </div>
          <div className="font-semibold text-primary">{fmtArea(sqFt)}</div>
        </div>
      )}

      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-2">
          <div className="font-medium text-muted-foreground flex items-center gap-1">
            <ZapIcon className="w-3.5 h-3.5" /> Mulch Calculator
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Depth:</label>
            <select value={calcDepth} onChange={e => setCalcDepth(Number(e.target.value))} className="bg-background border border-border rounded px-1 py-0.5 text-xs">
              {[1,2,3,4].map(d => <option key={d} value={d}>{d}&quot;</option>)}
            </select>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>🛍️ <span className="text-foreground font-medium">{mulchBags(sqFt, calcDepth)} bags</span> (2 cu ft bags)</div>
            <div>🚚 <span className="text-foreground font-medium">{cuYd} cu yd</span> bulk order</div>
          </div>
        </div>
      )}

      {sqFt > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-2">
          <div className="font-medium text-muted-foreground flex items-center gap-1">
            <Leaf className="w-3.5 h-3.5 text-green-400" /> Plant Spacing
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Spacing:</label>
            <select value={calcSpacing} onChange={e => setCalcSpacing(Number(e.target.value))} className="bg-background border border-border rounded px-1 py-0.5 text-xs">
              {[6,9,12,18,24,36].map(s => <option key={s} value={s}>{s}&quot;</option>)}
            </select>
          </div>
          <div>🌱 Fits <span className="text-foreground font-medium">{numPlants} plants</span> at {calcSpacing}&quot; spacing</div>
        </div>
      )}

      {zone.notes && <p className="text-xs text-muted-foreground">{zone.notes}</p>}

      {zonePlants.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">{zonePlants.length} plant{zonePlants.length !== 1 ? "s" : ""} in this zone</div>
          {zonePlants.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-xs py-0.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.status === "healthy" ? "bg-green-400" : p.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"}`} />
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlantPanel({ plant, onAi, aiLoading, aiResult }: {
  plant: DbPlant;
  onAi: (f: File, mode: "identify" | "diagnose", name?: string) => void;
  aiLoading: boolean;
  aiResult: string | null;
}) {
  return (
    <div className="space-y-3 pr-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${plant.status === "healthy" ? "bg-green-400" : plant.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"}`} />
        <h3 className="font-semibold">{plant.name}</h3>
        <Badge variant={plant.status === "healthy" ? "success" : plant.status === "needs_attention" ? "warning" : "danger"} className="text-xs">
          {plant.status.replace("_", " ")}
        </Badge>
      </div>
      {plant.species && <p className="text-xs text-muted-foreground italic">{plant.species}</p>}
      {plant.notes && <p className="text-xs text-muted-foreground">{plant.notes}</p>}

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">AI Analysis</div>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <span className="block w-full text-center text-xs py-2 rounded-lg bg-green-900/40 border border-green-700/40 text-green-400 hover:bg-green-900/60 transition-colors">🌿 Identify</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onAi(f, "identify"); }} />
          </label>
          <label className="flex-1 cursor-pointer">
            <span className="block w-full text-center text-xs py-2 rounded-lg bg-yellow-900/40 border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors">🔍 Diagnose</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onAi(f, "diagnose", plant.name); }} />
          </label>
        </div>
        {aiLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
          </div>
        )}
        {aiResult && (
          <div className="bg-muted/50 rounded-lg p-2 text-xs whitespace-pre-wrap text-foreground/80">{aiResult}</div>
        )}
      </div>
    </div>
  );
}

function WalkResultPanel({ result, zones, targetZoneId, onSaveToZone }: {
  result: ZoneCalcResult;
  zones: DbZone[];
  targetZoneId: string | null;
  onSaveToZone: (zoneId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(targetZoneId || "");

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

      {/* Save to zone */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 space-y-2">
        <div className="text-xs font-medium text-amber-400">Save boundary to zone</div>
        <Select value={selectedZoneId} onValueChange={setSelectedZoneId}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a zone…" /></SelectTrigger>
          <SelectContent>
            {zones.map(z => (
              <SelectItem key={z.id} value={z.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: z.color }} />
                  {z.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" className="w-full gap-1 h-9"
          disabled={!selectedZoneId || saving}
          onClick={async () => { setSaving(true); await onSaveToZone(selectedZoneId); setSaving(false); }}
        >
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : <><Check className="w-3 h-3" /> Save Boundary</>}
        </Button>
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

function ZoneFallbackList({ zones }: { zones: DbZone[] }) {
  if (zones.length === 0) {
    return (
      <div className="w-full max-w-sm mt-4 text-center text-muted-foreground text-sm">
        No zones yet. Add a Mapbox token to start mapping your yard.
      </div>
    );
  }
  return (
    <div className="w-full max-w-sm mt-4">
      <h3 className="text-sm font-medium mb-2 text-muted-foreground">Your Zones ({zones.length})</h3>
      <div className="grid gap-2">
        {zones.map(zone => (
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
