import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, Clock } from "lucide-react";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function AdminWindow() {
  const [w, setW] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");

  const load = () => api.get("/window").then((r) => {
    setW(r.data); setEnabled(r.data.enabled);
    setOpens(toLocalInput(r.data.opens_at)); setCloses(toLocalInput(r.data.closes_at));
  });
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const { data } = await api.put("/admin/window", {
        enabled,
        opens_at: opens ? new Date(opens).toISOString() : null,
        closes_at: closes ? new Date(closes).toISOString() : null,
      });
      setW(data);
      toast.success("Request window updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  return (
    <Layout title="Request Window">
      <div className="max-w-xl space-y-6">
        {w && (
          <div className={`rounded-lg border p-4 flex items-center gap-3 ${w.is_open ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid="window-state">
            {w.is_open ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            <p className="font-medium">{w.message}</p>
          </div>
        )}
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Configure Window</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enable submissions</Label>
              <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="window-enabled-switch" />
            </div>
            <div className="space-y-2">
              <Label className="tiny-label">Opening Date/Time</Label>
              <Input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} data-testid="window-opens-input" />
            </div>
            <div className="space-y-2">
              <Label className="tiny-label">Closing Date/Time</Label>
              <Input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} data-testid="window-closes-input" />
            </div>
            <p className="text-xs text-muted-foreground">Leave dates empty and keep "Enable submissions" on to open the window immediately (manual open). Turn it off to close immediately.</p>
            <Button onClick={save} className="bg-primary hover:bg-primary/90" data-testid="save-window-button">Save Window Settings</Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
