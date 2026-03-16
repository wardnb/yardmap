"use client";

import { useState, useEffect } from "react";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { 
  Plus, CheckCircle, Circle, Droplets, Scissors, 
  Flame, Apple, Leaf, CheckSquare, RefreshCw, Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTasks, createTask, updateTask, deleteTask, getZones } from "@/lib/data";
import { seasonalTips } from "@/lib/mock-data";
import type { Task, Zone } from "@/types";

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  water:     { label: "Water",     icon: <Droplets className="w-4 h-4" />,    color: "text-blue-400" },
  fertilize: { label: "Fertilize", icon: <Flame className="w-4 h-4" />,      color: "text-orange-400" },
  prune:     { label: "Prune",     icon: <Scissors className="w-4 h-4" />,    color: "text-purple-400" },
  plant:     { label: "Plant",     icon: <Leaf className="w-4 h-4" />,        color: "text-green-400" },
  harvest:   { label: "Harvest",   icon: <Apple className="w-4 h-4" />,       color: "text-red-400" },
  other:     { label: "Other",     icon: <CheckSquare className="w-4 h-4" />, color: "text-muted-foreground" },
};

function getDueLabel(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return { label: "Today", class: "text-yellow-400" };
  if (isTomorrow(d)) return { label: "Tomorrow", class: "text-blue-400" };
  if (isPast(d)) return { label: "Overdue", class: "text-red-400" };
  return { label: format(d, "MMM d"), class: "text-muted-foreground" };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    Promise.all([getTasks(), getZones()]).then(([t, z]) => {
      setTasks(t as Task[]);
      setZones(z as Zone[]);
      setLoading(false);
    });
  }, []);

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newCompleted = !task.completed;
    const updates = {
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    };
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      await updateTask(id, updates);
    } catch (err) {
      console.error("Failed to update task:", err);
      // revert
      setTasks(prev => prev.map(t => t.id === id ? task : t));
    }
  };

  const filtered = tasks
    .filter(t => filter === "all" ? true : filter === "pending" ? !t.completed : t.completed)
    .filter(t => categoryFilter === "all" || t.category === categoryFilter)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

  const overdueCount = tasks.filter(t => !t.completed && isPast(parseISO(t.due_date))).length;
  const todayCount = tasks.filter(t => !t.completed && isToday(parseISO(t.due_date))).length;
  const month = new Date().getMonth() + 1;
  const suggestions = seasonalTips[month]?.slice(0, 3) || [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Task Calendar</h1>
          <p className="text-muted-foreground mt-1">
            {overdueCount > 0 && <span className="text-red-400">{overdueCount} overdue · </span>}
            {todayCount} due today
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <AddTaskForm
              zones={zones}
              onAdd={async (task) => {
                try {
                  const newTask = await createTask(task);
                  setTasks(prev => [...prev, newTask as Task]);
                  setAddOpen(false);
                } catch (err) {
                  console.error("Failed to add task:", err);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Seasonal suggestions */}
      {suggestions.length > 0 && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Seasonal Suggestions for Zone 6b</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={async () => {
                    try {
                      const newTask = await createTask({
                        property_id: "00000000-0000-0000-0000-000000000001",
                        zone_id: null,
                        plant_id: null,
                        title: s,
                        due_date: format(new Date(), "yyyy-MM-dd"),
                        category: "other",
                        recurrence: null,
                        completed: false,
                        completed_at: null,
                        notes: "Seasonal suggestion",
                      });
                      setTasks(prev => [...prev, newTask as Task]);
                    } catch (err) {
                      console.error("Failed to add seasonal task:", err);
                    }
                  }}
                  className="text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2 py-1 rounded-full transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["pending", "all", "done"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-9">
            <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(categoryConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {loading && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
            <p>Loading tasks...</p>
          </div>
        )}
        {!loading && filtered.map(task => {
          const cat = categoryConfig[task.category] || categoryConfig.other;
          const due = getDueLabel(task.due_date);
          return (
            <div
              key={task.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                task.completed
                  ? "border-border/50 opacity-50 bg-card/50"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <button
                onClick={() => toggleTask(task.id)}
                className={`mt-0.5 flex-shrink-0 ${task.completed ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
              >
                {task.completed
                  ? <CheckCircle className="w-5 h-5" />
                  : <Circle className="w-5 h-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${task.completed ? "line-through" : ""}`}>
                  {task.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-xs ${due.class}`}>{due.label}</span>
                  <span className={`flex items-center gap-1 text-xs ${cat.color}`}>
                    {cat.icon}{cat.label}
                  </span>
                  {task.recurrence && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3" />{task.recurrence}
                    </span>
                  )}
                </div>
                {task.notes && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{task.notes}</p>
                )}
              </div>
              <button
                onClick={async () => {
                  await deleteTask(task.id);
                  setTasks(prev => prev.filter(t => t.id !== task.id));
                }}
                className="text-muted-foreground hover:text-red-400 transition-colors text-xs px-1"
                title="Delete task"
              >
                ✕
              </button>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No tasks found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddTaskForm({ zones, onAdd }: { zones: Zone[]; onAdd: (task: Omit<Task, "id">) => void }) {
  const [form, setForm] = useState({
    title: "",
    due_date: format(new Date(), "yyyy-MM-dd"),
    category: "other",
    recurrence: "",
    notes: "",
    zone_id: "",
    property_id: "00000000-0000-0000-0000-000000000001",
    plant_id: null as string | null,
    completed: false,
    completed_at: null as string | null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...form,
      recurrence: form.recurrence || null,
      zone_id: form.zone_id || null,
      notes: form.notes || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>Title *</Label>
        <Input
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          required
          placeholder="What needs to be done?"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Due Date *</Label>
          <Input
            type="date"
            value={form.due_date}
            onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
            required
          />
        </div>
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
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Zone</Label>
          <Select value={form.zone_id} onValueChange={v => setForm(p => ({ ...p, zone_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">No zone</SelectItem>
              {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Recurrence</Label>
          <Select value={form.recurrence} onValueChange={v => setForm(p => ({ ...p, recurrence: v }))}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Biweekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={2}
        />
      </div>
      <Button type="submit" className="w-full">Add Task</Button>
    </form>
  );
}
