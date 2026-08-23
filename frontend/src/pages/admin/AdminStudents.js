import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function AdminStudents() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/admin/students").then((r) => setRows(r.data)); }, []);
  const filtered = rows.filter((r) => `${r.pgpid} ${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Layout title="Students">
      <Input data-testid="student-search" placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm mb-4" />
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="students-table">
            <TableHeader><TableRow><TableHead>PGPID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.pgpid}><TableCell className="font-mono text-sm">{r.pgpid}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-muted-foreground">{r.email}</TableCell></TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-10">No students. Import master data first.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
