"use client";

import { useState } from "react";
import { format, parseISO, isPast, isWithinInterval, addDays } from "date-fns";
import { 
  Plus, Search, Package, AlertTriangle, DollarSign, 
  FlaskConical, Wrench, Leaf, Flame
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { mockInventory } from "@/lib/mock-data";

type Item = typeof mockInventory[0];

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  fertilizer: { label: "Fertilizer", icon: <Flame className="w-4 h-4" />,        color: "text-orange-400" },
  chemical:   { label: "Chemical",   icon: <FlaskConical className="w-4 h-4" />,   color: "text-red-400" },
  tool:       { label: "Tool",       icon: <Wrench className="w-4 h-4" />,         color: "text-blue-400" },
  seed:       { label: "Seed",       icon: <Leaf className="w-4 h-4" />,           color: "text-green-400" },
  other:      { label: "Other",      icon: <Package className="w-4 h-4" />,        color: "text-muted-foreground" },
};

function getExpiryStatus(expiryDate: string | null) {
  if (!expiryDate) return null;
  const d = parseISO(expiryDate);
  if (isPast(d)) return { label: "Expired", variant: "danger" as const };
  if (isWithinInterval(new Date(), { start: new Date(), end: addDays(d, 90) })) {
    return { label: "Expiring soon", variant: "warning" as const };
  }
  return { label: format(d, "MMM yyyy"), variant: "outline" as const };
}

export default function InventoryPage() {
  const [items, setItems] = useState(mockInventory);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || item.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const totalValue = items.reduce((sum, i) => sum + (i.cost || 0), 0);
  const expiredCount = items.filter(i => i.expiry_date && isPast(parseISO(i.expiry_date))).length;
  const expiringSoon = items.filter(i => {
    if (!i.expiry_date) return false;
    const d = parseISO(i.expiry_date);
    return !isPast(d) && isWithinInterval(new Date(), { start: new Date(), end: addDays(d, 90) });
  }).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Shed Inventory</h1>
          <p className="text-muted-foreground mt-1">{items.length} items tracked</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            <AddItemForm
              onAdd={(item) => {
                setItems(prev => [...prev, { ...item, id: `i${Date.now()}` }]);
                setAddOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs text-muted-foreground">Total Items</span>
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs text-muted-foreground">Value</span>
              <DollarSign className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-400">${totalValue.toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs text-muted-foreground">Expiring</span>
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{expiredCount + expiringSoon}</div>
          </CardContent>
        </Card>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            categoryFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
          }`}
        >
          All
        </button>
        {Object.entries(categoryConfig).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setCategoryFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5 ${
              categoryFilter === k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
            }`}
          >
            <span className={categoryFilter === k ? "text-primary-foreground" : v.color}>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search inventory..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Items */}
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map(item => {
          const cat = categoryConfig[item.category] || categoryConfig.other;
          const expiry = getExpiryStatus(item.expiry_date);
          return (
            <Card key={item.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${cat.color}`}>{cat.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
                      <span className={cat.color}>{cat.label}</span>
                      <span className="font-medium text-foreground">{item.quantity} {item.unit}</span>
                      {item.cost && (
                        <span className="flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />{item.cost.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {expiry && (
                      <div className="mt-1">
                        <Badge variant={expiry.variant} className="text-xs">{expiry.label}</Badge>
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{item.notes}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No items found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddItemForm({ onAdd }: { onAdd: (item: Omit<Item, "id">) => void }) {
  const [form, setForm] = useState({
    name: "", category: "other", quantity: "1", unit: "",
    expiry_date: "", cost: "", notes: "", property_id: "prop-1",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...form,
      quantity: parseFloat(form.quantity),
      cost: form.cost ? parseFloat(form.cost) : 0,
      expiry_date: form.expiry_date || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          required
          placeholder="Product name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(categoryConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            step="0.1"
            value={form.quantity}
            onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Unit</Label>
          <Input
            value={form.unit}
            onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
            placeholder="bags, qt, lbs..."
          />
        </div>
        <div>
          <Label>Cost ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.cost}
            onChange={e => setForm(p => ({ ...p, cost: e.target.value }))}
            placeholder="0.00"
          />
        </div>
      </div>
      <div>
        <Label>Expiry Date</Label>
        <Input
          type="date"
          value={form.expiry_date}
          onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))}
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={2}
        />
      </div>
      <Button type="submit" className="w-full">Add Item</Button>
    </form>
  );
}
