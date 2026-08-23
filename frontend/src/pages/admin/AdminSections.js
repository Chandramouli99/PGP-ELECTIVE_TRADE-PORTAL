import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function AdminSections() {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});

  const load = () => api.get("/admin/sections").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const setEdit = (id, key, val) => setEdits((e) => ({ ...e, [id]: { ...e[id], [key]: val } }));

  const save = async (r) => {
    const e = edits[r.section_id] || {};
    const min_capacity = e.min !== undefined ? (e.min === "" ? null : Number(e.min)) : r.min_capacity;
    const max_capacity = e.max !== undefined ? (e.max === "" ? null : Number(e.max)) : r.max_capacity;
    try {
      await api.put(`/admin/sections/${r.section_id}`, { min_capacity, max_capacity });
      toast.success(`Limits saved for ${r.course_code} ${r.section_name}`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
  };

  return (
    <Layout title="Sections">
      <p className="text-sm text-muted-foreground mb-4">Master mapping: Course → Sections → schedule & capacity limits. Set Min/Max to power the Feasibility engine.</p>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table data-testid="sections-table">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="w-24">Min</TableHead>
                <TableHead className="w-24">Max</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.section_id}>
                  <TableCell className="font-medium">{r.course_name} <span className="text-muted-foreground font-mono text-xs">({r.course_code})</span></TableCell>
                  <TableCell>{r.section_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.day && r.day !== "Not timetabled" ? `${r.day} · ${r.time_slot}` : "Not timetabled"}</TableCell>
                  <TableCell>
                    <Input type="number" data-testid={`min-${r.section_id}`} className="h-8" defaultValue={r.min_capacity ?? ""} onChange={(e) => setEdit(r.section_id, "min", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" data-testid={`max-${r.section_id}`} className="h-8" defaultValue={r.max_capacity ?? ""} onChange={(e) => setEdit(r.section_id, "max", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-8" data-testid={`save-${r.section_id}`} onClick={() => save(r)}><Save className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No sections. Import master data first.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
