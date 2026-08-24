import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge, REQUEST_TYPE_LABELS } from "@/components/StatusBadge";
import { toast } from "sonner";

export default function AdminSwaps() {
  const [swaps, setSwaps] = useState([]);
  const load = () => api.get("/admin/requests").then((r) => setSwaps(r.data.filter((x) => x.swap)));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    try {
      await api.post(`/admin/requests/${id}/decision`, { decision });
      toast.success(`Swap ${decision}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <Layout title="Swap Requests">
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="admin-swaps-table">
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Initiator</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Exchange</TableHead>
                <TableHead>Partner Confirm</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {swaps.map((r) => (
                <TableRow key={r.request_id} data-testid={`swap-row-${r.request_id}`}>
                  <TableCell className="font-mono text-xs">{r.request_id}</TableCell>
                  <TableCell>{REQUEST_TYPE_LABELS[r.request_type]}</TableCell>
                  <TableCell>{r.student_pgpid}</TableCell>
                  <TableCell>{r.swap.partner_pgpid}</TableCell>
                  <TableCell className="text-xs">{(r.swap.initiator_gives || [r.swap.initiator_current]).map((x) => `${x.course_name} ${x.section_name}`).join(" + ")} ⇄ {(r.swap.initiator_gets || [r.swap.initiator_requested]).map((x) => `${x.course_name} ${x.section_name}`).join(" + ")}</TableCell>
                  <TableCell>{r.swap.partner_confirmed===true?"Accepted":r.swap.partner_confirmed===false?"Rejected":"Pending"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    {r.status === "BOTH_CONFIRMED" && (
                      <div className="flex gap-2">
                        <Button size="sm" data-testid={`approve-swap-${r.request_id}`} className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => decide(r.request_id, "approve")}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200" onClick={() => decide(r.request_id, "reject")}>Reject</Button>
                      </div>
                    )}
                    {r.status === "APPROVED_PENDING_EXECUTION" && (
                      <Button size="sm" data-testid={`execute-swap-${r.request_id}`} className="bg-primary hover:bg-primary/90 h-8" onClick={() => decide(r.request_id, "executed")}>Mark Executed</Button>
                    )}
                    {r.status === "AWAITING_PARTNER_CONFIRMATION" && <span className="text-xs text-muted-foreground">Awaiting partner</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
