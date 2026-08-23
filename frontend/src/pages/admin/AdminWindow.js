import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, Clock, Zap } from "lucide-react";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function remaining(closesAt) {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h ${m}m` : `${h}h ${m}m`;
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

  const put = async (body, msg) => {
    try {
      const { data } = await api.put("/admin/window", body);
      setW(data); setEnabled(data.enabled);
      setOpens(toLocalInput(data.opens_at)); setCloses(toLocalInput(data.closes_at));
      toast.success(msg || "Request window updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  const saveCustom = () => put({
    enabled,
    opens_at: opens ? new Date(opens).toISOString() : null,
    closes_at: closes ? new Date(closes).toISOString() : null,
  });

  const openFor24h = () => put({ enabled: true, opens_at: null, closes_at: null }, "Window opened for 24 hours");
  const closeNow = () => put({ enabled: false, opens_at: null, closes_at: null }, "Window closed");
  const extendBy = (hours) => {
    const base = w?.closes_at ? new Date(w.closes_at) : new Date();
    const target = base.getTime() > Date.now() ? base : new Date();
    put({ enabled: true, opens_at: w?.opens_at || null, closes_at: new Date(target.getTime() + hours * 3600000).toISOString() }, `Window extended by ${hours}h`);
  };

  return (
    <Layout title="Request Window">
      <div className="max-w-xl space-y-6">
        {w && (
          <div className={`rounded-lg border p-4 ${w.is_open ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid="window-state">
            <div className="flex items-center gap-3">
              {w.is_open ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
              <p className="font-medium">{w.message}</p>
            </div>
            {w.is_open && w.closes_at && (
              <p className="text-sm mt-2 ml-8" data-testid="admin-window-remaining">Closes in <span className="font-semibold">{remaining(w.closes_at)}</span> ({new Date(w.closes_at).toLocaleString()})</p>
            )}
          </div>
        )}

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Zap className="h-4 w-4 text-accent" /> Quick Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button data-testid="open-24h-button" onClick={openFor24h} className="bg-primary hover:bg-primary/90">Open now for 24 hours</Button>
            <Button data-testid="extend-12h-button" variant="outline" onClick={() => extendBy(12)}>Extend +12h</Button>
            <Button data-testid="extend-24h-button" variant="outline" onClick={() => extendBy(24)}>Extend +24h</Button>
            <Button data-testid="close-now-button" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={closeNow}>Close now</Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle>Custom Schedule</CardTitle></CardHeader>
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
            <p className="text-xs text-muted-foreground">Enable submissions with no closing time set and it defaults to 24 hours. Use Quick Actions to extend anytime.</p>
            <Button onClick={saveCustom} className="bg-primary hover:bg-primary/90" data-testid="save-window-button">Save Window Settings</Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
