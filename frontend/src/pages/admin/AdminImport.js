import { useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const KINDS = [
  { id: "students", label: "Students", cols: "PGPID, Name, Email" },
  { id: "courses", label: "Courses", cols: "Course Code, Course Name" },
  { id: "sections", label: "Sections", cols: "Course Code, Section, Min, Max" },
  { id: "enrollments", label: "Enrollments", cols: "PGPID, Course Code, Section" },
];

export default function AdminImport() {
  const [kind, setKind] = useState("students");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setPreview(null);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    try {
      const { data } = await api.post("/admin/import/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import/commit", { token: preview.token });
      toast.success(`Imported ${data.inserted} ${data.kind} records`);
      setPreview(null);
    } catch (err) { toast.error(err?.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  const current = KINDS.find((k) => k.id === kind);

  return (
    <Layout title="Master Data Import">
      <div className="max-w-4xl space-y-6">
        <Tabs value={kind} onValueChange={(v) => { setKind(v); setPreview(null); }}>
          <TabsList data-testid="import-kind-tabs">
            {KINDS.map((k) => <TabsTrigger key={k.id} value={k.id} data-testid={`import-tab-${k.id}`}>{k.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-primary" /> Upload {current.label} (CSV / Excel)</CardTitle>
            <CardDescription>Expected columns: <span className="font-medium">{current.cols}</span></CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-12 cursor-pointer hover:border-primary transition-colors">
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={upload} data-testid="import-file-input" />
              {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-muted-foreground" />}
              <p className="text-sm text-muted-foreground mt-2">Click to select a {current.label.toLowerCase()} file</p>
            </label>
          </CardContent>
        </Card>

        {preview && (
          <Card className="shadow-sm" data-testid="import-preview">
            <CardHeader>
              <CardTitle className="text-lg">Preview & Validation</CardTitle>
              <CardDescription className="flex gap-4 mt-1">
                <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {preview.valid} valid</span>
                <span className="flex items-center gap-1 text-red-700"><AlertTriangle className="h-4 w-4" /> {preview.errors} with errors</span>
                <span className="text-muted-foreground">of {preview.total} rows</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto border rounded-md">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.rows.map((r, i) => (
                      <TableRow key={i} className={r.valid ? "" : "bg-red-50"}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="text-xs">{Object.values(r.data).join(" · ")}</TableCell>
                        <TableCell className="text-xs">{r.valid ? <span className="text-emerald-700">Valid</span> : <span className="text-red-700">{r.errors.join(", ")}</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-3 mt-4">
                <Button data-testid="confirm-import-button" onClick={commit} disabled={busy || preview.valid === 0} className="bg-primary hover:bg-primary/90">
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm Import ({preview.valid} valid records)
                </Button>
                <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
