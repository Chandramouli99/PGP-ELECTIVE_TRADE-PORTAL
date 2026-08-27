import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, REQUEST_TYPE_LABELS } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { FilePlus2 } from "lucide-react";

export default function MyRequests() {
  const [reqs, setReqs] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/student/requests").then((r) => setReqs(r.data)).catch(() => {});
  }, []);

  const summarize = (r) => {
    if (r.clash) return `Drop ${r.clash.drop.course_name} → ${r.clash.preferences.length} preference(s)`;
    if (r.swap) {
      const g = r.swap.initiator_gives || (r.swap.initiator_current ? [r.swap.initiator_current] : []);
      const t = r.swap.initiator_gets || (r.swap.initiator_requested ? [r.swap.initiator_requested] : []);
      return `${g.map((x) => x.course_name).join(" + ")} → ${t.map((x) => `${x.course_name} (Sec ${x.section_name})`).join(" + ")}`;
    }
    return r.actions.map((a) => `${a.action === "ADD" ? "Add" : "Drop"} ${a.course_name} ${a.section_name}`).join(", ");
  };

  return (
    <Layout title="My Requests">
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {reqs.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground">You haven't submitted any requests yet.</p>
              <Button className="mt-4 bg-primary hover:bg-primary/90" data-testid="empty-submit-cta" onClick={() => navigate("/submit")}>
                <FilePlus2 className="h-4 w-4 mr-2" /> Submit a Request
              </Button>
            </div>
          ) : (
            <Table data-testid="my-requests-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqs.map((r) => (
                  <TableRow
                    key={r.request_id}
                    data-testid={`request-row-${r.request_id}`}
                    className="cursor-pointer"
                    onClick={() => navigate(`/requests/${r.request_id}`)}
                  >
                    <TableCell className="font-mono text-sm">{r.request_id}</TableCell>
                    <TableCell>{REQUEST_TYPE_LABELS[r.request_type]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{summarize(r)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
