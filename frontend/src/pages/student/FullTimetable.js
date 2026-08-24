import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LayoutGrid, Users, Loader2 } from "lucide-react";

const DAY_ROWS = ["Mon / Tue", "Wed / Thu", "Fri / Sat"];
const AREA = "bg-card border-border hover:border-primary";

export default function FullTimetable() {
  const [sections, setSections] = useState([]);
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/student/timetable/all").then((r) => setSections(r.data.sections)).catch(() => {}); }, []);

  const timetabled = sections.filter((s) => s.day && s.day !== "Not timetabled" && s.time_slot && s.time_slot !== "—");
  const notTimetabled = sections.filter((s) => !(s.day && s.day !== "Not timetabled" && s.time_slot && s.time_slot !== "—"));
  const slots = [...new Set(timetabled.map((s) => s.time_slot))].sort();
  const cellFor = (day, slot) => timetabled.filter((s) => s.day === day && s.time_slot === slot);

  const openRoster = async (sec) => {
    setOpen(true); setRoster(null); setLoading(true);
    try { const { data } = await api.get(`/student/section/${sec.section_id}/students`); setRoster(data); }
    catch { setRoster({ students: [] }); }
    finally { setLoading(false); }
  };

  const SectionBlock = ({ s }) => (
    <button data-testid={`tt-section-${s.course_code}-${s.section_name}`} onClick={() => openRoster(s)}
      className={`w-full text-left rounded-md border p-2 mb-1 text-xs transition-colors ${AREA}`}>
      <p className="font-semibold">{s.course_code} · Sec {s.section_name}</p>
      <p className="opacity-75 leading-tight">{s.course_name}</p>
      {s.mid_tag && <p className="opacity-60">{s.mid_tag}</p>}
    </button>
  );

  return (
    <Layout title="Full Timetable">
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
        The complete Term V timetable across all courses and sections. Tap any section to see the students in it.
      </p>
      <Card className="shadow-sm overflow-x-auto">
        <CardHeader className="flex flex-row items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /><CardTitle className="text-xl">Master Weekly Grid</CardTitle></CardHeader>
        <CardContent>
          {timetabled.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No timetable loaded.</p>
          ) : (
            <div className="min-w-[900px]">
              <table className="w-full border-collapse" data-testid="full-timetable-grid">
                <thead>
                  <tr><th className="text-left tiny-label p-2 w-28">Day / Time</th>{slots.map((s) => <th key={s} className="text-left tiny-label p-2 border-l">{s}</th>)}</tr>
                </thead>
                <tbody>
                  {DAY_ROWS.filter((d) => timetabled.some((s) => s.day === d)).map((day) => (
                    <tr key={day} className="border-t align-top">
                      <td className="p-2 font-medium text-sm">{day}</td>
                      {slots.map((slot) => (
                        <td key={slot} className="p-1.5 border-l align-top min-w-[150px]">
                          {cellFor(day, slot).map((s) => <SectionBlock key={s.section_id} s={s} />)}
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
        <Card className="shadow-sm mt-6">
          <CardHeader><CardTitle className="text-lg">Not Timetabled</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {notTimetabled.map((s) => (
              <button key={s.section_id} data-testid={`tt-section-${s.course_code}-${s.section_name}`} onClick={() => openRoster(s)} className="rounded-md border bg-secondary px-3 py-2 text-sm hover:border-primary">
                <span className="font-medium">{s.course_code}</span> · Sec {s.section_name}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="roster-dialog">
          <DialogHeader>
            <DialogTitle>{roster ? `${roster.course_name} · Section ${roster.section_name}` : "Students"}</DialogTitle>
            <DialogDescription>Students enrolled in this section.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y">
              {roster?.students?.length ? roster.students.map((st) => (
                <div key={st.pgpid} className="flex items-center gap-3 py-2" data-testid={`roster-${st.pgpid}`}>
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="text-sm font-medium">{st.name}</p><p className="text-xs text-muted-foreground font-mono">{st.pgpid}</p></div>
                </div>
              )) : <p className="text-sm text-muted-foreground py-6 text-center">No students in this section.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
