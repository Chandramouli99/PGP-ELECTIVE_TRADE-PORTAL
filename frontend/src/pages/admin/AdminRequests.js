import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, REQUEST_TYPE_LABELS } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { API } from "@/lib/api";

const ALL_STATUSES = ["SUBMITTED","UNDER_REVIEW","AWAITING_PARTNER_CONFIRMATION","PARTNER_REJECTED","BOTH_CONFIRMED","APPROVED_PENDING_EXECUTION","REJECTED","CANCELLED","EXECUTED"];

export default function AdminRequests() {
  const [reqs, setReqs] = useState([]);
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");

  const load = () => api.get("/admin/requests").then((r) => setReqs(r.data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => reqs.filter((r) => {
    if (typeF !== "ALL" && r.request_type !== typeF) return false;
    if (statusF !== "ALL" && r.status !== statusF) return false;
    if (q) {
      const hay = `${r.request_id} ${r.student_pgpid} ${r.student_name} ${r.actions?.map(a=>a.course_name).join(" ")} ${r.swap?.initiator_current?.course_name||""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [reqs, q, typeF, statusF]);

  const courseOf = (r) => r.swap ? r.swap.initiator_current.course_name : (r.actions?.map(a=>a.course_name).join(", ") || "—");
  const sectionOf = (r) => r.swap ? `${r.swap.initiator_current.section_name}→${r.swap.initiator_requested.section_name}` : (r.actions?.map(a=>a.section_name).join(", ") || "—");

  const decide = async (decision) => {
    try {
      await api.post(`/admin/requests/${selected.request_id}/decision`, { decision, comment });
      toast.success(`Request ${decision === "approve" ? "approved" : decision}`);
      setSelected(null); setComment("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  const isSwap = selected?.swap;
  const canApprove = selected && (!isSwap || selected.status === "BOTH_CONFIRMED");
  const canExecute = selected?.status === "APPROVED_PENDING_EXECUTION";

  return (
    <Layout title="All Requests">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input data-testid="request-search" placeholder="Search PGPID, name, course, request ID" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeF} onValueChange={setTypeF}>
          <SelectTrigger className="w-44" data-testid="filter-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {Object.keys(REQUEST_TYPE_LABELS).map((t) => <SelectItem key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-44" data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button data-testid="export-excel-button" className="bg-accent hover:bg-accent/90 text-white" onClick={() => window.open(`${API}/admin/export`, "_blank")}>
          <Download className="h-4 w-4 mr-2" /> Download Requests as Excel
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="admin-requests-table">
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>PGPID</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.request_id} className="cursor-pointer" data-testid={`admin-request-row-${r.request_id}`} onClick={() => { setSelected(r); setComment(""); }}>
                  <TableCell className="font-mono text-xs">{r.request_id}</TableCell>
                  <TableCell>{r.student_pgpid}</TableCell>
                  <TableCell>{r.student_name}</TableCell>
                  <TableCell>{REQUEST_TYPE_LABELS[r.request_type]}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{courseOf(r)}</TableCell>
                  <TableCell>{sectionOf(r)}</TableCell>
                  <TableCell>{r.swap?.partner_pgpid || "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader><DialogTitle className="font-mono">{selected.request_id} · {REQUEST_TYPE_LABELS[selected.request_type]}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <p><span className="text-muted-foreground">Student:</span> {selected.student_name} ({selected.student_pgpid})</p>
                {selected.actions?.map((a, i) => (
                  <p key={i}><span className={`px-2 py-0.5 rounded text-xs font-medium mr-2 ${a.action==="ADD"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}>{a.action}</span>{a.course_name} — Section {a.section_name}</p>
                ))}
                {selected.swap && (
                  <div className="rounded-md bg-secondary p-3 space-y-1">
                    <p>Partner: <span className="font-medium">{selected.swap.partner_name} ({selected.swap.partner_pgpid})</span></p>
                    <p>Initiator: {selected.swap.initiator_current.course_name} {selected.swap.initiator_current.section_name} → {selected.swap.initiator_requested.course_name} {selected.swap.initiator_requested.section_name}</p>
                    <p>Partner confirmation: <span className="font-medium">{selected.swap.partner_confirmed===true?"Accepted":selected.swap.partner_confirmed===false?"Rejected":"Pending"}</span></p>
                  </div>
                )}
                {selected.comment && <p><span className="text-muted-foreground">Comment:</span> {selected.comment}</p>}
                <div className="pt-1"><StatusBadge status={selected.status} /></div>
                {isSwap && selected.status !== "BOTH_CONFIRMED" && selected.status !== "APPROVED_PENDING_EXECUTION" && selected.status !== "EXECUTED" && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Swap cannot be approved until both students have confirmed.</p>
                )}
                <Textarea data-testid="admin-decision-comment" placeholder="Decision comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {canApprove && !canExecute && selected.status !== "EXECUTED" && selected.status !== "REJECTED" && (
                    <Button size="sm" data-testid="approve-button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide("approve")}>Approve — Pending Execution</Button>
                  )}
                  {canExecute && (
                    <Button size="sm" data-testid="execute-button" className="bg-primary hover:bg-primary/90" onClick={() => decide("executed")}>Mark Executed</Button>
                  )}
                  {selected.status !== "REJECTED" && selected.status !== "EXECUTED" && (
                    <Button size="sm" variant="outline" data-testid="reject-button" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => decide("reject")}>Reject</Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
