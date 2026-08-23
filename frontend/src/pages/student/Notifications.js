import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, RefreshCw, Check, X } from "lucide-react";

export default function Notifications() {
  const [notes, setNotes] = useState([]);
  const [swaps, setSwaps] = useState([]);

  const load = () => {
    api.get("/student/notifications").then((r) => setNotes(r.data));
    api.get("/student/pending-swaps").then((r) => setSwaps(r.data));
  };
  useEffect(() => { load(); }, []);

  const respond = async (id, action) => {
    try {
      await api.post(`/student/swaps/${id}/respond`, { action });
      toast.success(action === "accept" ? "Swap accepted — awaiting admin approval" : "Swap rejected");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <Layout title="Notifications">
      <div className="space-y-8 max-w-3xl">
        <div>
          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"><RefreshCw className="h-5 w-5 text-accent" /> Swap Requests Awaiting Your Response</h3>
          {swaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending swap requests.</p>
          ) : (
            <div className="space-y-4">
              {swaps.map((s) => (
                <Card key={s.request_id} className="shadow-sm border-accent/30" data-testid={`pending-swap-${s.request_id}`}>
                  <CardContent className="p-5">
                    <p className="font-medium mb-2">🔄 {s.swap.partner_pgpid === undefined ? "" : ""}{s.student_pgpid} has requested a {s.swap.kind.toLowerCase()} swap with you.</p>
                    <div className="rounded-md bg-secondary p-4 text-sm space-y-1 mb-3">
                      <p><span className="text-muted-foreground">Course:</span> {s.swap.partner_current.course_name}</p>
                      <p><span className="text-muted-foreground">Your current:</span> {s.swap.partner_current.course_name} — Section {s.swap.partner_current.section_name}</p>
                      <p><span className="text-muted-foreground">Requested from you:</span> {s.swap.partner_requested.course_name} — Section {s.swap.partner_requested.section_name}</p>
                      <p><span className="text-muted-foreground">{s.student_pgpid} gives you:</span> {s.swap.initiator_current.course_name} — Section {s.swap.initiator_current.section_name}</p>
                    </div>
                    <div className="flex gap-3">
                      <Button size="sm" data-testid={`accept-swap-${s.request_id}`} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respond(s.request_id, "accept")}>
                        <Check className="h-4 w-4 mr-1" /> Accept Swap
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`reject-swap-${s.request_id}`} className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => respond(s.request_id, "reject")}>
                        <X className="h-4 w-4 mr-1" /> Reject Swap
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> All Notifications</h3>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.notification_id} className="bg-card border rounded-md p-4 flex items-start gap-3" data-testid={`notification-${n.notification_id}`}>
                  <div className={`h-2 w-2 rounded-full mt-2 ${n.read ? "bg-transparent" : "bg-accent"}`} />
                  <div>
                    <p className="text-sm">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
