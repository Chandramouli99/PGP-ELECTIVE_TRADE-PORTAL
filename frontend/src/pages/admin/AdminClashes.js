import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { AlertTriangle, UserRound, CheckCircle2, Clock, XCircle } from "lucide-react";

const ACTIONABLE = ["SUBMITTED", "UNDER_REVIEW"];

const TRACK_STYLES = {
  UNRESOLVED: { cls: "bg-red-50 text-red-700 border-red-200", label: "Unresolved", Icon: XCircle },
  IN_PROGRESS: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "In Progress", Icon: Clock },
  RESOLVED: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Resolved", Icon: CheckCircle2 },
};

function TrackBadge({ status }) {
  const s = TRACK_STYLES[status] || TRACK_STYLES.UNRESOLVED;
  const Icon = s.Icon;
  return (
    <span data-testid={`track-status-${status}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {s.label}
    </span>
  );
}

function ClashTracker() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/clash-tracker").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div />;
  const { summary, entries } = data;

  const stat = (label, value, cls, testid) => (
    <Card className="shadow-sm" data-testid={testid}>
      <CardContent className="p-5">
        <p className="tiny-label">{label}</p>
        <p className={`text-3xl font-semibold mt-1 ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Total Clashes", summary.total, "", "track-total")}
        {stat("Unresolved", summary.unresolved, "text-red-600", "track-unresolved")}
        {stat("In Progress", summary.in_progress, "text-amber-600", "track-inprogress")}
        {stat("Resolved", summary.resolved, "text-emerald-600", "track-resolved")}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">No timetable clashes on record.</p>
          ) : (
            <Table data-testid="clash-tracker-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Courses</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Request</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i} data-testid={`tracker-row-${e.pgpid}`}>
                    <TableCell>
                      <p className="font-medium text-sm">{e.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{e.pgpid}</p>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{e.day} · {e.time_slot}</TableCell>
                    <TableCell className="text-sm">{e.courses.join(" × ")}</TableCell>
                    <TableCell><TrackBadge status={e.status} /></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {e.request_id ? <>{e.request_id}<br /><span className="text-[10px]">{e.request_status}</span></> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResolutionQueue() {
  const [reqs, setReqs] = useState([]);
  const [sel, setSel] = useState({});
  const [comments, setComments] = useState({});

  const load = () => api.get("/admin/clashes").then((r) => setReqs(r.data));
  useEffect(() => { load(); }, []);

  const approve = async (r) => {
    const rank = sel[r.request_id];
    if (!rank) { toast.error("Select a preference to approve first"); return; }
    try {
      await api.post(`/admin/clashes/${r.request_id}/approve`, { preference_rank: rank, comment: comments[r.request_id] });
      toast.success(`Approved preference ${rank} — pending execution`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Approve failed"); }
  };
  const reject = async (r) => {
    try {
      await api.post(`/admin/clashes/${r.request_id}/reject`, { comment: comments[r.request_id] });
      toast.success("Request rejected");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reject failed"); }
  };
  const execute = async (r) => {
    try {
      await api.post(`/admin/clashes/${r.request_id}/execute`, { comment: comments[r.request_id] });
      toast.success("Executed — student's enrollment updated, clash resolved");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Execute failed"); }
  };

  const pending = reqs.filter((r) => !["EXECUTED", "REJECTED"].includes(r.status));
  const closed = reqs.filter((r) => ["EXECUTED", "REJECTED"].includes(r.status));

  const renderCard = (r) => {
    const canDecide = ACTIONABLE.includes(r.status);
    const canExecute = r.status === "APPROVED_PENDING_EXECUTION";
    return (
      <Card key={r.request_id} className="shadow-sm" data-testid={`clash-req-${r.request_id}`}>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center"><UserRound className="h-4 w-4 text-red-600" /></div>
            <div>
              <p className="font-medium text-sm">{r.student_name} <span className="text-muted-foreground font-mono">({r.student_pgpid})</span></p>
              <p className="text-xs text-muted-foreground font-mono">{r.request_id}</p>
            </div>
          </div>
          <StatusBadge status={r.status} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md bg-secondary p-3 space-y-1">
            <p><span className="text-muted-foreground">Clash slot:</span> <span className="font-medium">{r.clash.slot.day} · {r.clash.slot.time_slot}</span></p>
            <p><span className="text-muted-foreground">Dropping:</span> <span className="font-medium text-red-700">{r.clash.drop.course_name} — Sec {r.clash.drop.section_name} ({r.clash.drop.credits}cr)</span></p>
          </div>

          <div>
            <p className="text-muted-foreground mb-2">Replacement preferences {canDecide && <span className="text-xs">(select one to approve)</span>}:</p>
            <div className="space-y-2">
              {r.clash.preferences.map((p) => {
                const selected = sel[r.request_id] === p.rank;
                const approved = r.clash.approved_rank === p.rank;
                const clickable = canDecide;
                return (
                  <button
                    key={p.rank}
                    disabled={!clickable}
                    data-testid={`clash-${r.request_id}-pref-${p.rank}`}
                    onClick={() => clickable && setSel((s) => ({ ...s, [r.request_id]: p.rank }))}
                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                      approved ? "border-emerald-400 bg-emerald-50" : selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                    } ${clickable ? "hover:bg-secondary cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Preference {p.rank}</span>
                      <span className="text-xs text-muted-foreground">{p.total_credits}cr</span>
                      {approved && <span className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>}
                    </div>
                    <p className="mt-1">{p.items.map((i) => `${i.course_name} (Sec ${i.section_name})`).join(" + ")}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {(canDecide || canExecute) && (
            <Textarea
              placeholder="Optional comment to the student"
              data-testid={`clash-comment-${r.request_id}`}
              value={comments[r.request_id] || ""}
              onChange={(e) => setComments((c) => ({ ...c, [r.request_id]: e.target.value }))}
              className="text-sm"
            />
          )}

          {r.admin_comment && !canDecide && <p className="text-xs text-muted-foreground">Admin note: {r.admin_comment}</p>}

          <div className="flex gap-2 pt-1">
            {canDecide && (
              <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`clash-approve-${r.request_id}`} onClick={() => approve(r)}>Approve Selected</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`clash-reject-${r.request_id}`} onClick={() => reject(r)}>Reject</Button>
              </>
            )}
            {canExecute && (
              <>
                <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid={`clash-execute-${r.request_id}`} onClick={() => execute(r)}>Execute (apply change)</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`clash-reject-${r.request_id}`} onClick={() => reject(r)}>Reject</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Open ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open clash-resolution requests.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">{pending.map(renderCard)}</div>
        )}
      </div>
      {closed.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Closed ({closed.length})</h3>
          <div className="grid grid-cols-1 gap-4">{closed.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}

export default function AdminClashes() {
  return (
    <Layout title="Clash Resolutions">
      <div className="space-y-6 max-w-5xl">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">High-priority timetable-clash handling. Use <span className="font-medium">Clash Tracker</span> to see every clash and whether it's resolved; use <span className="font-medium">Resolution Requests</span> to approve a student's replacement preference and execute it.</p>
        </div>

        <Tabs defaultValue="tracker">
          <TabsList data-testid="clash-tabs">
            <TabsTrigger value="tracker" data-testid="tab-tracker">Clash Tracker</TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">Resolution Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="tracker" className="mt-5"><ClashTracker /></TabsContent>
          <TabsContent value="requests" className="mt-5"><ResolutionQueue /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
