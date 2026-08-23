import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, ArrowUpCircle, ArrowDownCircle, HelpCircle } from "lucide-react";

const FLAG_META = {
  OK: { label: "Within Limits", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  OVER: { label: "Over Max", cls: "bg-red-50 text-red-700 border-red-200", icon: ArrowUpCircle },
  UNDER: { label: "Below Min", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: ArrowDownCircle },
  NO_LIMIT: { label: "No Limit Set", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: HelpCircle },
};

function FillBar({ current, projected, max }) {
  const cap = max || Math.max(current, projected, 1);
  const curPct = Math.min(100, (current / cap) * 100);
  const projPct = Math.min(100, (projected / cap) * 100);
  const over = max && projected > max;
  return (
    <div className="w-40">
      <div className="h-3 rounded-full bg-slate-100 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${curPct}%` }} />
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-red-500" : "bg-primary"}`} style={{ width: `${projPct}%`, opacity: 0.85 }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>proj {projected}</span>
        <span>{max ? `max ${max}` : "no max"}</span>
      </div>
    </div>
  );
}

export default function AdminFeasibility() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/feasibility").then((r) => setData(r.data)); }, []);
  if (!data) return <Layout title="Feasibility Engine"><div /></Layout>;
  const s = data.summary;

  return (
    <Layout title="Feasibility Engine">
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
        Global view that models <span className="font-medium text-foreground">current enrollment + all pending adds, drops and swaps together</span> to flag which sections
        stay within limits. This does not auto-approve anything — you remain the decision-maker.
        Set section min/max limits on the <Link to="/admin/sections" className="text-accent underline">Sections</Link> page to enable OVER/UNDER flags.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(FLAG_META).map(([k, m]) => {
          const Icon = m.icon;
          return (
            <Card key={k} className="shadow-sm" data-testid={`feasibility-summary-${k}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="tiny-label">{m.label}</p>
                  <Icon className="h-4 w-4 opacity-60" />
                </div>
                <p className="text-3xl font-semibold mt-1">{s[k]}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="feasibility-table">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Adds</TableHead>
                <TableHead className="text-right">Drops</TableHead>
                <TableHead className="text-right">Projected</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead>Fill</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sections.map((r) => {
                const m = FLAG_META[r.flag];
                return (
                  <TableRow key={r.section_id} data-testid={`feasibility-row-${r.course_code}-${r.section_name}`}>
                    <TableCell className="font-medium">{r.course_name} <span className="text-muted-foreground font-mono text-xs">({r.course_code})</span></TableCell>
                    <TableCell>{r.section_name}</TableCell>
                    <TableCell className="text-right">{r.current}</TableCell>
                    <TableCell className="text-right text-emerald-700">+{r.pending_adds}</TableCell>
                    <TableCell className="text-right text-red-700">-{r.pending_drops}</TableCell>
                    <TableCell className="text-right font-semibold">{r.projected}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.min_capacity ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.max_capacity ?? "—"}</TableCell>
                    <TableCell><FillBar current={r.current} projected={r.projected} max={r.max_capacity} /></TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded text-xs font-medium border ${m.cls}`}>{m.label}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
