"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, Search, Leaf, AlertTriangle, Skull, SlidersHorizontal, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { mockPlants, mockZones } from "@/lib/mock-data";
import type { Plant } from "@/types";

const statusConfig = {
  healthy:          { label: "Healthy",          icon: Leaf,          variant: "success" as const,  color: "text-green-400" },
  needs_attention:  { label: "Needs Attention",   icon: AlertTriangle, variant: "warning" as const,  color: "text-yellow-400" },
  dead:             { label: "Dead",              icon: Skull,         variant: "danger" as const,   color: "text-red-400" },
};

export default function PlantsPage() {
  const [plants, setPlants] = useState<Plant[]>(mockPlants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);

  const filtered = plants.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.species?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (p.common_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getZoneName = (zoneId: string | null) =>
    mockZones.find(z => z.id === zoneId)?.name || "Unknown Zone";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Plant Inventory</h1>
          <p className="text-muted-foreground mt-1">{plants.length} plants tracked</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Plant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Plant</DialogTitle>
            </DialogHeader>
            <AddPlantForm
              onAdd={(plant) => {
                setPlants(prev => [...prev, { ...plant, id: `p${Date.now()}` }]);
                setAddOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(statusConfig).map(([status, config]) => {
          const count = plants.filter(p => p.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                statusFilter === status ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div className={`text-2xl font-bold ${config.color}`}>{count}</div>
              <div className="text-xs text-muted-foreground">{config.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search plants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem>
            <SelectItem value="dead">Dead</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Plant list */}
      <div className="grid gap-3">
        {filtered.map(plant => {
          const config = statusConfig[plant.status];
          const Icon = config.icon;
          return (
            <Card
              key={plant.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedPlant(plant)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{plant.name}</h3>
                      <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
                    </div>
                    {plant.species && (
                      <div className="text-sm text-muted-foreground italic">{plant.species}</div>
                    )}
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span>{getZoneName(plant.zone_id)}</span>
                      {plant.date_planted && (
                        <span>Planted {format(new Date(plant.date_planted), "MMM d, yyyy")}</span>
                      )}
                      {plant.cost != null && (
                        <span className="flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />{plant.cost.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {plant.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{plant.notes}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Leaf className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No plants found</p>
          </div>
        )}
      </div>

      {/* Plant detail dialog */}
      {selectedPlant && (
        <Dialog open={!!selectedPlant} onOpenChange={() => setSelectedPlant(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedPlant.name}</DialogTitle>
            </DialogHeader>
            <PlantDetail plant={selectedPlant} zoneName={getZoneName(selectedPlant.zone_id)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PlantDetail({ plant, zoneName }: { plant: Plant; zoneName: string }) {
  const config = statusConfig[plant.status];
  const Icon = config.icon;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <Badge variant={config.variant}>{config.label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {plant.species && (
          <div>
            <div className="text-muted-foreground text-xs">Species</div>
            <div className="italic">{plant.species}</div>
          </div>
        )}
        <div>
          <div className="text-muted-foreground text-xs">Zone</div>
          <div>{zoneName}</div>
        </div>
        {plant.date_planted && (
          <div>
            <div className="text-muted-foreground text-xs">Date Planted</div>
            <div>{format(new Date(plant.date_planted), "MMMM d, yyyy")}</div>
          </div>
        )}
        {plant.source && (
          <div>
            <div className="text-muted-foreground text-xs">Source</div>
            <div>{plant.source}</div>
          </div>
        )}
        {plant.cost != null && (
          <div>
            <div className="text-muted-foreground text-xs">Cost</div>
            <div>${plant.cost.toFixed(2)}</div>
          </div>
        )}
      </div>
      {plant.notes && (
        <div>
          <div className="text-muted-foreground text-xs mb-1">Notes</div>
          <p className="text-sm bg-muted rounded-lg p-3">{plant.notes}</p>
        </div>
      )}
    </div>
  );
}

function AddPlantForm({ onAdd }: { onAdd: (plant: Omit<Plant, "id">) => void }) {
  const [form, setForm] = useState({
    name: "", species: "", common_name: "", zone_id: "", date_planted: "",
    source: "", cost: "", notes: "", status: "healthy" as Plant["status"],
    location_geojson: null as object | null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...form,
      zone_id: form.zone_id || null,
      species: form.species || null,
      common_name: form.common_name || null,
      date_planted: form.date_planted || null,
      source: form.source || null,
      notes: form.notes || null,
      cost: form.cost ? parseFloat(form.cost) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Name *</Label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
        </div>
        <div>
          <Label>Species</Label>
          <Input value={form.species} onChange={e => setForm(p => ({ ...p, species: e.target.value }))} placeholder="Botanical name" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Zone</Label>
          <Select value={form.zone_id} onValueChange={v => setForm(p => ({ ...p, zone_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
            <SelectContent>
              {mockZones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as Plant["status"] }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="needs_attention">Needs Attention</SelectItem>
              <SelectItem value="dead">Dead</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date Planted</Label>
          <Input type="date" value={form.date_planted} onChange={e => setForm(p => ({ ...p, date_planted: e.target.value }))} />
        </div>
        <div>
          <Label>Source</Label>
          <Input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="Nursery, etc." />
        </div>
      </div>
      <div>
        <Label>Cost ($)</Label>
        <Input type="number" step="0.01" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} placeholder="0.00" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
      </div>
      <Button type="submit" className="w-full">Add Plant</Button>
    </form>
  );
}
