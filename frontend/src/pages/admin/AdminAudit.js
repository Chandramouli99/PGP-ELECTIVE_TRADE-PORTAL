import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/admin/audit").then((r) => setLogs(r.data)); }, []);
  return (
    <Layout title="Audit Log">
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="audit-table">
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Detail</TableHead><TableHead>Request</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.log_id} data-testid={`audit-row-${l.log_id}`}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium text-sm">{l.action}</TableCell>
                  <TableCell className="text-sm">{l.actor}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.detail}</TableCell>
                  <TableCell className="font-mono text-xs">{l.request_id || "—"}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No audit entries yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
