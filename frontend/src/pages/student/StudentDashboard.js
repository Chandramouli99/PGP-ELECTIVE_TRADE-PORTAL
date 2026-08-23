import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, GraduationCap } from "lucide-react";

const AREA_COLORS = {
  MKT: "bg-blue-100 text-blue-800", "F&A": "bg-emerald-100 text-emerald-800",
  "IT&S": "bg-purple-100 text-purple-800", HRM: "bg-pink-100 text-pink-800",
  OM: "bg-amber-100 text-amber-800", STRAT: "bg-indigo-100 text-indigo-800",
  ABM: "bg-lime-100 text-lime-800", COM: "bg-cyan-100 text-cyan-800", GM: "bg-slate-100 text-slate-700",
};

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/student/dashboard").then((r) => setData(r.data)).catch(() => {}); }, []);
  const win = data?.window;

  return (
    <Layout title="Dashboard">
      {data && (
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-semibold">Welcome, {data.name}</h2>
            <p className="text-muted-foreground mt-1">
              PGPID: <span className="font-medium text-foreground">{data.pgpid}</span>
              {data.program && <span className="ml-3">Program: <span className="font-medium text-foreground">{data.program}</span></span>}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Window banner */}
            <div
              data-testid="window-banner"
              className={`lg:col-span-2 rounded-lg border p-4 flex items-center gap-3 ${
                win?.is_open ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
              }`}
            >
              {win?.is_open ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              <p className="font-medium">{win?.message}</p>
            </div>

            {/* Credits card */}
            <Card
              data-testid="credit-status-card"
              className={`shadow-sm ${data.credit_status === "ok" ? "border-emerald-200" : "border-red-300"}`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="tiny-label">Term V Credits</p>
                  <GraduationCap className="h-4 w-4 text-primary/50" />
                </div>
                <p className="text-3xl font-semibold mt-1">
                  {data.total_credits}
                  <span className="text-base text-muted-foreground font-normal"> / {data.credit_min}–{data.credit_max}</span>
                </p>
                <p className={`text-xs mt-1 ${data.credit_status === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                  {data.credit_message}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2">
              <BookOpenIcon />
              <CardTitle className="text-xl">Your Current Courses</CardTitle>
            </CardHeader>
            <CardContent>
              {data.courses.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6 text-center">No enrollments found for your account yet.</p>
              ) : (
                <Table data-testid="current-courses-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.courses.map((c) => (
                      <TableRow key={c.course_id} data-testid={`course-row-${c.course_code}`}>
                        <TableCell className="font-medium">{c.course_name} <span className="text-muted-foreground font-mono text-xs">({c.course_code})</span></TableCell>
                        <TableCell>{c.section_name}</TableCell>
                        <TableCell>
                          {c.area && <span className={`px-2 py-0.5 rounded text-xs font-medium ${AREA_COLORS[c.area] || "bg-slate-100 text-slate-700"}`}>{c.area}</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.day && c.day !== "Not timetabled" ? `${c.day} · ${c.time_slot}` : "Not timetabled"}</TableCell>
                        <TableCell className="text-right font-medium">{c.credits}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}

function BookOpenIcon() {
  return <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
