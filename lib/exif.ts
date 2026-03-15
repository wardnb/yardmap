/**
 * EXIF GPS extraction — reads GPS coordinates from photo files
 */
export interface ExifGps {
  lat: number;
  lng: number;
  altitude?: number;
  timestamp?: Date;
}

export async function extractExifGps(file: File): Promise<ExifGps | null> {
  try {
    // Dynamic import to avoid SSR issues
    const exifr = await import("exifr");
    const result = await exifr.default.gps(file);
    if (!result || result.latitude == null || result.longitude == null) return null;
    return {
      lat: result.latitude,
      lng: result.longitude,
      altitude: result.latitude,
    };
  } catch {
    return null;
  }
}

/** Read EXIF date taken */
export async function extractExifDate(file: File): Promise<Date | null> {
  try {
    const exifr = await import("exifr");
    const result = await exifr.default.parse(file, ["DateTimeOriginal", "CreateDate"]);
    return result?.DateTimeOriginal || result?.CreateDate || null;
  } catch {
    return null;
  }
}

/** Create an object URL from a file, auto-revoked after 60 seconds */
export function createPhotoUrl(file: File): string {
  const url = URL.createObjectURL(file);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}
