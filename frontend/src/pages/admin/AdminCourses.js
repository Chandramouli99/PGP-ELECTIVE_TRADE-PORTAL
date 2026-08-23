import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminCourses() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/courses").then((r) => setRows(r.data)); }, []);
  return (
    <Layout title="Courses">
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="courses-table">
            <TableHeader><TableRow><TableHead>Course Code</TableHead><TableHead>Course Name</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (<TableRow key={r.course_id}><TableCell className="font-mono text-sm">{r.course_code}</TableCell><TableCell>{r.course_name}</TableCell></TableRow>))}
              {rows.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-10">No courses. Import master data first.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
