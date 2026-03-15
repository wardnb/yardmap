"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Layers, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockZones, mockPlants, mockProperty } from "@/lib/mock-data";

const BOISE_COORDS: [number, number] = [-116.2023, 43.6150];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const zoneColors: Record<string, string> = {
  lawn: "#4ade80",
  garden_bed: "#a78bfa",
  hardscape: "#94a3b8",
  irrigation: "#38bdf8",
  fence: "#fb923c",
  tree: "#86efac",
};

type Zone = typeof mockZones[0];
type Plant = typeof mockPlants[0];

interface SelectedInfo {
  type: "zone" | "plant";
  data: Zone | Plant;
}

export default function PropertyMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<unknown>(null);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [noToken, setNoToken] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "pk.your-mapbox-token") {
      setNoToken(true);
      return;
    }

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      
      (mapboxgl as { accessToken: string }).accessToken = MAPBOX_TOKEN;

      const m = new mapboxgl.Map({
        container: mapContainer.current!,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: BOISE_COORDS,
        zoom: 17,
        pitchWithRotate: false,
      });

      m.on("load", () => {
        setMapLoaded(true);
        map.current = m;

        // Add mock zone polygons as approximate squares around the center
        const baseCoords = BOISE_COORDS;
        const zoneFeatures = mockZones.map((zone, i) => {
          const offset = 0.0003;
          const row = Math.floor(i / 2);
          const col = i % 2;
          const cx = baseCoords[0] + (col - 0.5) * offset * 3;
          const cy = baseCoords[1] + (row - 0.5) * offset * 2;
          return {
            type: "Feature" as const,
            properties: { id: zone.id, name: zone.name, type: zone.type, color: zone.color },
            geometry: {
              type: "Polygon" as const,
              coordinates: [[
                [cx - offset, cy - offset * 0.6],
                [cx + offset, cy - offset * 0.6],
                [cx + offset, cy + offset * 0.6],
                [cx - offset, cy + offset * 0.6],
                [cx - offset, cy - offset * 0.6],
              ]],
            },
          };
        });

        m.addSource("zones", {
          type: "geojson",
          data: { type: "FeatureCollection", features: zoneFeatures },
        });

        m.addLayer({
          id: "zones-fill",
          type: "fill",
          source: "zones",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.35,
          },
        });

        m.addLayer({
          id: "zones-border",
          type: "line",
          source: "zones",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.8,
          },
        });

        // Add zone labels
        m.addLayer({
          id: "zones-label",
          type: "symbol",
          source: "zones",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.7)",
            "text-halo-width": 1,
          },
        });

        // Click handler for zones
        m.on("click", "zones-fill", (e) => {
          const props = e.features?.[0]?.properties;
          if (props) {
            const zone = mockZones.find(z => z.id === props.id);
            if (zone) setSelected({ type: "zone", data: zone });
          }
        });

        m.on("mouseenter", "zones-fill", () => {
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", "zones-fill", () => {
          m.getCanvas().style.cursor = "";
        });

        // Add plant markers
        mockPlants.forEach((plant, i) => {
          const offset = 0.0001;
          const row = Math.floor(i / 3);
          const col = i % 3;
          const cx = BOISE_COORDS[0] + (col - 1) * offset * 2;
          const cy = BOISE_COORDS[1] + (row - 1) * offset * 1.5;

          const el = document.createElement("div");
          el.className = "plant-marker";
          el.style.cssText = `
            width: 12px; height: 12px; border-radius: 50%;
            background: ${plant.status === "healthy" ? "#4ade80" : plant.status === "needs_attention" ? "#facc15" : "#f87171"};
            border: 2px solid rgba(0,0,0,0.5);
            cursor: pointer;
          `;

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([cx, cy])
            .addTo(m);

          el.addEventListener("click", () => {
            setSelected({ type: "plant", data: plant });
          });
        });
      });
    };

    initMap();

    return () => {
      if (map.current) {
        (map.current as { remove: () => void }).remove();
      }
    };
  }, []);

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
            <a href="https://mapbox.com" className="text-primary underline" target="_blank" rel="noreferrer">
              mapbox.com
            </a>
          </p>
        </div>

        {/* Show mock zone list as fallback */}
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
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-3 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium text-white mb-2">
          <Layers className="w-3.5 h-3.5" /> Zones
        </div>
        {Object.entries(zoneColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-white/80">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
        <div className="border-t border-white/20 pt-1.5 mt-1.5">
          <div className="flex items-center gap-1.5 text-white/80">
            <div className="w-3 h-3 rounded-full bg-green-400" /> Healthy
          </div>
          <div className="flex items-center gap-1.5 text-white/80">
            <div className="w-3 h-3 rounded-full bg-yellow-400" /> Attention
          </div>
        </div>
      </div>

      {/* Selected panel */}
      {selected && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-72 bg-card border border-border rounded-xl shadow-xl p-4">
          <button
            onClick={() => setSelected(null)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
          {selected.type === "zone" && (
            <ZonePanel zone={selected.data as Zone} />
          )}
          {selected.type === "plant" && (
            <PlantPanel plant={selected.data as Plant} />
          )}
        </div>
      )}
    </div>
  );
}

function ZonePanel({ zone }: { zone: Zone }) {
  const plants = mockPlants.filter(p => p.zone_id === zone.id);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-sm" style={{ background: zone.color }} />
        <h3 className="font-semibold">{zone.name}</h3>
        <Badge variant="outline" className="text-xs capitalize ml-auto">{zone.type.replace("_", " ")}</Badge>
      </div>
      {zone.notes && <p className="text-xs text-muted-foreground mb-2">{zone.notes}</p>}
      {plants.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">{plants.length} plant{plants.length !== 1 ? "s" : ""}</div>
          <div className="space-y-1">
            {plants.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  p.status === "healthy" ? "bg-green-400" : p.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"
                }`} />
                {p.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlantPanel({ plant }: { plant: Plant }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${
          plant.status === "healthy" ? "bg-green-400" : plant.status === "needs_attention" ? "bg-yellow-400" : "bg-red-400"
        }`} />
        <h3 className="font-semibold">{plant.name}</h3>
      </div>
      {plant.species && <p className="text-xs text-muted-foreground italic mb-1">{plant.species}</p>}
      <Badge
        variant={plant.status === "healthy" ? "success" : plant.status === "needs_attention" ? "warning" : "danger"}
        className="text-xs mb-2"
      >
        {plant.status.replace("_", " ")}
      </Badge>
      {plant.notes && <p className="text-xs text-muted-foreground mt-1">{plant.notes}</p>}
    </div>
  );
}
