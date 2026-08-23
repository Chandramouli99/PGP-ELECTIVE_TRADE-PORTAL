import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminCapacity() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/capacity").then((r) => setRows(r.data)); }, []);

  return (
    <Layout title="Capacity & Global Overview">
      <p className="text-sm text-muted-foreground mb-4">
        Current enrollment vs limits, with pending adds/drops across all submitted requests and projected enrollment.
        This information is <span className="font-medium text-foreground">Admin-only</span> and never shown to students.
      </p>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="capacity-table">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Pending Adds</TableHead>
                <TableHead className="text-right">Pending Drops</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Projected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.section_id} data-testid={`capacity-row-${r.course_code}-${r.section_name}`}>
                  <TableCell className="font-medium">{r.course_name}</TableCell>
                  <TableCell>{r.section_name}</TableCell>
                  <TableCell className="text-right">{r.current}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.min_capacity}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.max_capacity}</TableCell>
                  <TableCell className="text-right text-emerald-700">+{r.pending_adds}</TableCell>
                  <TableCell className="text-right text-red-700">-{r.pending_drops}</TableCell>
                  <TableCell className={`text-right font-medium ${r.net_change > 0 ? "text-emerald-700" : r.net_change < 0 ? "text-red-700" : ""}`}>{r.net_change > 0 ? "+" : ""}{r.net_change}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.projected > r.max_capacity ? "text-red-700" : ""}`}>{r.projected}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
