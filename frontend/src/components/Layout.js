import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, BookOpen, FilePlus2, ListChecks, Bell, User, LogOut,
  Inbox, ArrowLeftRight, Users, GraduationCap, Layers, Gauge, Download,
  CalendarClock, ScrollText, UploadCloud, GitCompareArrows,
} from "lucide-react";

const STUDENT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: GraduationCap },
  { to: "/admin/sections", label: "Sections", icon: Layers },
  { to: "/admin/import", label: "Master Data", icon: UploadCloud },
  { to: "/admin/window", label: "Request Window", icon: CalendarClock },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = user?.role === "admin" ? ADMIN_NAV : STUDENT_NAV;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-primary text-primary-foreground flex flex-col fixed h-screen">
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
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive ? "bg-white/10 text-white font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-white/50 truncate">{user?.pgpid || user?.email}</p>
          </div>
          <Button
            variant="ghost"
            data-testid="logout-button"
            onClick={logout}
            className="w-full justify-start text-white/70 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-64">
        <header className="h-16 border-b bg-card flex items-center px-8 sticky top-0 z-10">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </header>
        <div className="p-8 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
