import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminSections() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/sections").then((r) => setRows(r.data)); }, []);
  return (
    <Layout title="Sections">
      <p className="text-sm text-muted-foreground mb-4">Master mapping: Course → Sections → Capacity limits.</p>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="sections-table">
            <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Max</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (<TableRow key={r.section_id}><TableCell className="font-medium">{r.course_name} <span className="text-muted-foreground font-mono text-xs">({r.course_code})</span></TableCell><TableCell>{r.section_name}</TableCell><TableCell className="text-right">{r.min_capacity}</TableCell><TableCell className="text-right">{r.max_capacity}</TableCell></TableRow>))}
              {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">No sections. Import master data first.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
