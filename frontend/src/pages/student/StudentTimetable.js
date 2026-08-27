import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, AlertTriangle } from "lucide-react";

const DAY_ROWS = ["Mon / Tue", "Wed / Thu", "Fri / Sat"];
const AREA_COLORS = {
  MKT: "bg-blue-50 border-blue-200 text-blue-900", "F&A": "bg-emerald-50 border-emerald-200 text-emerald-900",
  "IT&S": "bg-purple-50 border-purple-200 text-purple-900", HRM: "bg-pink-50 border-pink-200 text-pink-900",
  OM: "bg-amber-50 border-amber-200 text-amber-900", STRAT: "bg-indigo-50 border-indigo-200 text-indigo-900",
  ABM: "bg-lime-50 border-lime-200 text-lime-900", COM: "bg-cyan-50 border-cyan-200 text-cyan-900", GM: "bg-slate-50 border-slate-200 text-slate-800",
};

export default function StudentTimetable() {
  const [entries, setEntries] = useState([]);
  const [clashes, setClashes] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api.get("/student/timetable").then((r) => setEntries(r.data.entries)).catch(() => {});
    api.get("/student/clashes").then((r) => setClashes(r.data.clashes || [])).catch(() => {});
  }, []);

  const clashKeys = new Set(clashes.map((c) => `${c.day}|${c.time_slot}`));
  const timetabled = entries.filter((e) => e.day && e.day !== "Not timetabled" && e.time_slot && e.time_slot !== "—");
  const notTimetabled = entries.filter((e) => !e.day || e.day === "Not timetabled" || !e.time_slot || e.time_slot === "—");
  const slots = [...new Set(timetabled.map((e) => e.time_slot))].sort();

  const cellFor = (day, slot) => timetabled.filter((e) => e.day === day && e.time_slot === slot);

  return (
    <Layout title="Weekly Timetable">
      <div className="space-y-6">
        {clashes.length > 0 && (
          <div data-testid="timetable-clash-banner" className="rounded-lg border border-red-300 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Timetable clash — highlighted below in red</p>
                <p className="text-sm text-red-700 mt-0.5">Two courses share the same slot. Resolve it by dropping one and choosing a replacement.</p>
              </div>
            </div>
            <Button data-testid="timetable-resolve-clash-button" className="bg-red-600 hover:bg-red-700 shrink-0" onClick={() => navigate("/resolve-clash")}>
              Resolve Clash
            </Button>
          </div>
        )}
        <Card className="shadow-sm overflow-x-auto">
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl">Your Weekly Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {timetabled.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No timetabled courses found.</p>
            ) : (
              <div className="min-w-[900px]">
                <table className="w-full border-collapse" data-testid="timetable-grid">
                  <thead>
                    <tr>
                      <th className="text-left tiny-label p-2 w-28">Day / Time</th>
                      {slots.map((s) => <th key={s} className="text-left tiny-label p-2 border-l">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_ROWS.filter((d) => timetabled.some((e) => e.day === d)).map((day) => (
                      <tr key={day} className="border-t align-top">
                        <td className="p-2 font-medium text-sm">{day}</td>
                        {slots.map((slot) => (
                          <td key={slot} className={`p-1.5 border-l align-top ${clashKeys.has(`${day}|${slot}`) ? "bg-red-50 ring-2 ring-inset ring-red-300" : ""}`} data-testid={clashKeys.has(`${day}|${slot}`) ? `clash-cell-${day.replace(/[^a-zA-Z]+/g, "")}-${slot}` : undefined}>
                            {cellFor(day, slot).map((e, i) => (
                              <div key={i} className={`rounded-md border p-2 mb-1 text-xs ${AREA_COLORS[e.area] || "bg-slate-50 border-slate-200"}`} data-testid={`tt-${e.course_code}`}>
                                <p className="font-semibold">{e.course_code} <span className="font-normal">· Sec {e.section_name}</span></p>
                                <p className="opacity-80 leading-tight mt-0.5">{e.course_name}</p>
                                {e.mid_tag && <p className="opacity-70 mt-0.5">{e.mid_tag}</p>}
                              </div>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {notTimetabled.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg">Not Timetabled</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {notTimetabled.map((e, i) => (
                <div key={i} className="rounded-md border bg-secondary px-3 py-2 text-sm">
                  <span className="font-medium">{e.course_code}</span> · Sec {e.section_name} · {e.credits} cr
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
