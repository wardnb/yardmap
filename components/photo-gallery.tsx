"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, MapPin, Calendar, Leaf, AlertTriangle, Loader2, ChevronLeft, ChevronRight, ZapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { extractExifGps, extractExifDate, createPhotoUrl } from "@/lib/exif";
import { identifyPlant, diagnoseHealth } from "@/lib/ai-plant";
import { format } from "date-fns";

export interface PhotoEntry {
  id: string;
  url: string;
  thumbnail: string;
  label: string;
  date: Date;
  gps?: { lat: number; lng: number };
  hasExifGps: boolean;
  notes?: string;
  entityType: "plant" | "zone";
  entityId: string;
  entityName: string;
}

interface PhotoGalleryProps {
  entityType: "plant" | "zone";
  entityId: string;
  entityName: string;
  initialPhotos?: PhotoEntry[];
  plantName?: string; // for AI context
  showAi?: boolean;
}

export function PhotoGallery({ entityType, entityId, entityName, initialPhotos = [], plantName, showAi = false }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoEntry[]>(initialPhotos);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"identify" | "diagnose" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    const newPhotos: PhotoEntry[] = [];
    for (const file of Array.from(files)) {
      const url = createPhotoUrl(file);
      const [gps, dateTaken] = await Promise.all([
        extractExifGps(file),
        extractExifDate(file),
      ]);
      newPhotos.push({
        id: `ph-${entityId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url,
        thumbnail: url,
        label: file.name.replace(/\.[^.]+$/, ""),
        date: dateTaken || new Date(),
        gps: gps ? { lat: gps.lat, lng: gps.lng } : undefined,
        hasExifGps: !!gps,
        entityType,
        entityId,
        entityName,
      });
    }
    setPhotos(prev => [...prev, ...newPhotos]);
    setUploading(false);
  }, [entityId, entityName, entityType]);

  const runAi = useCallback(async (photo: PhotoEntry, mode: "identify" | "diagnose") => {
    setAiLoading(true);
    setAiMode(mode);
    setAiResult(null);

    // Fetch the blob and convert to data URL
    try {
      const resp = await fetch(photo.url);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (mode === "identify") {
          const r = await identifyPlant(dataUrl);
          if (r.isPlaceholder) setAiResult(r.notes || "");
          else if (r.identified) setAiResult(`🌿 **${r.commonName}** (*${r.scientificName}*)\n${r.notes}\n\n💧 ${r.careInstructions}`);
          else setAiResult("Could not identify — try a clearer photo of leaves or flowers.");
        } else {
          const r = await diagnoseHealth(dataUrl, plantName || entityName);
          if (r.isPlaceholder) setAiResult((r.recommendations || []).join("\n"));
          else {
            const issues = r.issues?.length ? `⚠️ ${r.issues.join(", ")}\n` : "";
            const recs = r.recommendations?.map(x => `✅ ${x}`).join("\n") || "";
            setAiResult(`Status: **${r.status}**\n${issues}${recs}`);
          }
        }
        setAiLoading(false);
      };
      reader.readAsDataURL(blob);
    } catch {
      setAiResult("Could not load image for analysis.");
      setAiLoading(false);
    }
  }, [plantName, entityName]);

  const lightboxPhoto = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing photos…
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Camera className="w-5 h-5" />
              <Upload className="w-4 h-4" />
            </div>
            <span>Drop photos or click to upload</span>
            <div className="text-xs mt-1 text-muted-foreground/60">GPS coordinates auto-read from EXIF</div>
          </div>
        )}
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              onClick={() => setLightboxIdx(idx)}
              className="relative aspect-square rounded-lg overflow-hidden group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumbnail} alt={photo.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              {photo.hasExifGps && (
                <div className="absolute bottom-1 right-1 bg-green-500/80 rounded-full p-0.5">
                  <MapPin className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="absolute bottom-1 left-1 text-xs text-white/80 bg-black/40 rounded px-1">
                {format(photo.date, "MMM d")}
              </div>
            </button>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No photos yet</p>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            {/* Nav arrows */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIdx(i => i !== null ? (i - 1 + photos.length) % photos.length : 0)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white z-10 hover:bg-black/80"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setLightboxIdx(i => i !== null ? (i + 1) % photos.length : 0)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white z-10 hover:bg-black/80"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <button
              onClick={() => setLightboxIdx(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxPhoto.url} alt={lightboxPhoto.label} className="rounded-xl w-full max-h-[60vh] object-contain bg-black" />

            {/* Metadata */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-white">{format(lightboxPhoto.date, "MMMM d, yyyy")}</span>
                {lightboxPhoto.hasExifGps && (
                  <Badge variant="success" className="text-xs">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS: {lightboxPhoto.gps?.lat.toFixed(5)}, {lightboxPhoto.gps?.lng.toFixed(5)}
                  </Badge>
                )}
              </div>

              {/* AI buttons (only for plant photos if showAi) */}
              {showAi && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-green-400 border-green-700/50 hover:bg-green-900/30"
                      onClick={() => runAi(lightboxPhoto, "identify")}
                      disabled={aiLoading}
                    >
                      <Leaf className="w-3 h-3" />
                      {aiLoading && aiMode === "identify" ? "Identifying…" : "Identify Plant"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-yellow-400 border-yellow-700/50 hover:bg-yellow-900/30"
                      onClick={() => runAi(lightboxPhoto, "diagnose")}
                      disabled={aiLoading}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {aiLoading && aiMode === "diagnose" ? "Analyzing…" : "Diagnose"}
                    </Button>
                  </div>
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <ZapIcon className="w-3 h-3 text-yellow-400" />
                      AI analyzing…
                    </div>
                  )}
                  {aiResult && (
                    <div className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-wrap text-foreground/90 border border-border">
                      {aiResult}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline indicator */}
              {photos.length > 1 && (
                <div className="flex items-center gap-1 justify-center">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === lightboxIdx ? "bg-primary" : "bg-white/30"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
