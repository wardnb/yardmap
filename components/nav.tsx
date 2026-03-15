"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Leaf, CheckSquare, Package, LayoutDashboard, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/map", icon: Map, label: "Map" },
  { href: "/plants", icon: Leaf, label: "Plants" },
  { href: "/tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/inventory", icon: Package, label: "Shed" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-16 lg:w-56 bg-card border-r border-border h-screen fixed left-0 top-0 z-40 py-4">
        <div className="px-3 mb-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Sprout className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="hidden lg:block font-bold text-lg text-foreground">YardMap</span>
        </div>
        <div className="flex flex-col gap-1 px-2">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </Link>
          ))}
        </div>
        <div className="mt-auto px-3 hidden lg:block">
          <div className="text-xs text-muted-foreground">
            <div className="font-medium text-foreground/60">Boise, ID</div>
            <div>Zone 6b</div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors",
                pathname === href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
