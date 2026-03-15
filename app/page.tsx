import Link from "next/link";
import { format } from "date-fns";
import { 
  CheckSquare, Leaf, AlertTriangle, Package, MapPin, 
  Droplets, Scissors, Flame, Apple, Sun, ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockTasks, mockPlants, mockInventory, seasonalTips } from "@/lib/mock-data";

const categoryIcons: Record<string, React.ReactNode> = {
  water: <Droplets className="w-4 h-4 text-blue-400" />,
  fertilize: <Flame className="w-4 h-4 text-orange-400" />,
  prune: <Scissors className="w-4 h-4 text-purple-400" />,
  plant: <Leaf className="w-4 h-4 text-green-400" />,
  harvest: <Apple className="w-4 h-4 text-red-400" />,
  other: <CheckSquare className="w-4 h-4 text-muted-foreground" />,
};

export default function Dashboard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const tips = seasonalTips[month] || [];
  
  const upcomingTasks = mockTasks
    .filter(t => !t.completed)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  const needsAttention = mockPlants.filter(p => p.status === "needs_attention");
  const healthyCount = mockPlants.filter(p => p.status === "healthy").length;
  
  const expiringInventory = mockInventory
    .filter(i => i.expiry_date && new Date(i.expiry_date) < new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000))
    .slice(0, 3);

  const monthName = now.toLocaleString("default", { month: "long" });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Good {getGreeting()}, Nick 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(now, "EEEE, MMMM d, yyyy")} · Boise, ID Zone 6b
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Plants"
          value={mockPlants.length}
          sub={`${healthyCount} healthy`}
          color="text-green-400"
          icon={<Leaf className="w-5 h-5 text-green-400" />}
        />
        <StatCard
          label="Open Tasks"
          value={mockTasks.filter(t => !t.completed).length}
          sub="this week"
          color="text-blue-400"
          icon={<CheckSquare className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          label="Needs Attention"
          value={needsAttention.length}
          sub="plants flagged"
          color="text-yellow-400"
          icon={<AlertTriangle className="w-5 h-5 text-yellow-400" />}
        />
        <StatCard
          label="Inventory"
          value={mockInventory.length}
          sub="items in shed"
          color="text-purple-400"
          icon={<Package className="w-5 h-5 text-purple-400" />}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Seasonal tip */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="w-5 h-5 text-primary" />
              {monthName} in Zone 6b
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tips.slice(0, 3).map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-0.5">•</span>
                  <span className="text-muted-foreground">{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Plants needing attention */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                Needs Attention
              </span>
              <Link href="/plants">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  All plants <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {needsAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground">All plants looking healthy! 🌿</p>
            ) : (
              <div className="space-y-2">
                {needsAttention.map(plant => (
                  <div key={plant.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{plant.name}</div>
                      <div className="text-xs text-muted-foreground">{plant.notes?.slice(0, 60)}</div>
                    </div>
                    <Badge variant="warning">Check</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming tasks */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-400" />
              Upcoming Tasks
            </span>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                All tasks <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {upcomingTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                {categoryIcons[task.category] || categoryIcons.other}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{task.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Due {format(new Date(task.due_date), "MMM d")}
                    {task.recurrence && ` · ${task.recurrence}`}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs capitalize">{task.category}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/map", label: "View Map", icon: <MapPin className="w-5 h-5" />, color: "text-green-400" },
          { href: "/plants", label: "Plant Log", icon: <Leaf className="w-5 h-5" />, color: "text-emerald-400" },
          { href: "/tasks", label: "Add Task", icon: <CheckSquare className="w-5 h-5" />, color: "text-blue-400" },
          { href: "/inventory", label: "Shed", icon: <Package className="w-5 h-5" />, color: "text-purple-400" },
        ].map(({ href, label, icon, color }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <span className={color}>{icon}</span>
                <span className="font-medium text-sm">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
