import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import api from "@/lib/api";
import {
  LayoutDashboard, FilePlus2, ListChecks, Bell, User, LogOut,
  Inbox, ArrowLeftRight, Users, GraduationCap, Layers, Gauge,
  CalendarClock, ScrollText, UploadCloud, GitCompareArrows, CalendarDays, TrendingUp, Menu, Clock,
} from "lucide-react";

const STUDENT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  { to: "/submit", label: "Submit Request", icon: FilePlus2 },
  { to: "/requests", label: "My Requests", icon: ListChecks },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/requests", label: "Requests", icon: Inbox },
  { to: "/admin/swaps", label: "Swaps", icon: GitCompareArrows },
  { to: "/admin/capacity", label: "Capacity", icon: Gauge },
  { to: "/admin/feasibility", label: "Feasibility", icon: TrendingUp },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: GraduationCap },
  { to: "/admin/sections", label: "Sections", icon: Layers },
  { to: "/admin/import", label: "Master Data", icon: UploadCloud },
  { to: "/admin/window", label: "Request Window", icon: CalendarClock },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

function SidebarContent({ nav, user, logout, unread, onNavigate }) {
  return (
    <div className="h-full flex flex-col bg-primary text-primary-foreground">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-accent" />
          <span className="font-serif-display text-xl font-semibold leading-tight">PGP Portal</span>
        </div>
        <p className="text-[11px] tracking-[0.15em] uppercase text-white/50 mt-1">
          {user?.role === "admin" ? "Administration" : "Course Change"}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const showBadge = item.to === "/notifications" && unread > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive ? "bg-white/10 text-white font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span data-testid="notification-badge" className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-white/50 truncate">{user?.pgpid || user?.email}</p>
        </div>
        <Button variant="ghost" data-testid="logout-button" onClick={logout} className="w-full justify-start text-white/70 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </div>
  );
}

function CountdownChip() {
  const [closesAt, setClosesAt] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    api.get("/window").then((r) => { setClosesAt(r.data.closes_at); setIsOpen(r.data.is_open); }).catch(() => {});
    const id = setInterval(() => tick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!isOpen || !closesAt) return null;
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
  return (
    <div data-testid="window-countdown" className="hidden sm:flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5">
      <Clock className="h-3.5 w-3.5" /> Window closes in {label}
    </div>
  );
}

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const nav = user?.role === "admin" ? ADMIN_NAV : STUDENT_NAV;

  const fetchUnread = useCallback(() => {
    if (user?.role !== "student") return;
    api.get("/student/notifications/unread-count").then((r) => setUnread(r.data.count)).catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 fixed h-screen z-30">
        <SidebarContent nav={nav} user={user} logout={logout} unread={unread} />
      </aside>

      <main className="flex-1 lg:ml-64">
        <header className="h-14 lg:h-16 border-b bg-card flex items-center gap-3 px-4 lg:px-8 sticky top-0 z-20">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-button">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
              <SidebarContent nav={nav} user={user} logout={logout} unread={unread} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="text-base lg:text-xl font-semibold tracking-tight flex-1 truncate">{title}</h1>
          {user?.role === "student" && <CountdownChip />}
        </header>
        <div className="p-4 lg:p-8 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
