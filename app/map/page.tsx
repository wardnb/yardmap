import PropertyMap from "@/components/property-map";

export default function MapPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Property Map</h1>
          <p className="text-xs text-muted-foreground">Boise, ID · Zone 6b · Click zones or plants to view details</p>
        </div>
      </div>
      <div className="flex-1">
        <PropertyMap />
      </div>
    </div>
  );
}
