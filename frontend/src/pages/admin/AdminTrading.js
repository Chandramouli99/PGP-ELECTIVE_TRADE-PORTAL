import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Store, Trash2, UserRound } from "lucide-react";

export default function AdminTrading() {
  const [data, setData] = useState(null);

  const load = () => api.get("/admin/trading").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);

  const toggle = async (enabled) => {
    try {
      await api.put("/admin/trading/settings", { enabled });
      toast.success(enabled ? "Trading board enabled" : "Trading board disabled");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  const remove = async (postId) => {
    try {
      await api.delete(`/admin/trading/${postId}`);
      toast.success("Post removed");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Remove failed"); }
  };

  const clearAll = async () => {
    try {
      const r = await api.delete("/admin/trading");
      toast.success(`Cleared ${r.data.deleted} case${r.data.deleted === 1 ? "" : "s"}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Clear failed"); }
  };

  if (!data) return <Layout title="Trading Board"><div /></Layout>;

  return (
    <Layout title="Trading Board">
      <div className="space-y-6 max-w-5xl">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> Board Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="trading-enabled">Enable trading board for students</Label>
              <Switch id="trading-enabled" data-testid="trading-enabled-switch" checked={data.enabled} onCheckedChange={toggle} />
            </div>
            <p className="text-xs text-muted-foreground">
              Students can view and post cases only when this is ON <span className="font-medium">and</span> the request window is open.
              Request window is currently <span className={data.window_open ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>{data.window_open ? "OPEN" : "CLOSED"}</span>.
            </p>
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-semibold">All Posted Cases ({data.posts.length})</h3>
            {data.posts.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="clear-all-trading-button" className="text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear All Cases
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-testid="clear-all-trading-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all trading cases?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes all {data.posts.length} posted case{data.posts.length === 1 ? "" : "s"} from the trading board. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="clear-all-cancel">Cancel</AlertDialogCancel>
                    <AlertDialogAction data-testid="clear-all-confirm" className="bg-red-600 hover:bg-red-700" onClick={clearAll}>
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {data.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases posted.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.posts.map((p) => (
                <Card key={p.post_id} className="shadow-sm" data-testid={`admin-trading-post-${p.pgpid}`}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><UserRound className="h-4 w-4 text-primary" /></div>
                        <div>
                          <p className="font-medium text-sm">{p.student_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.pgpid}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" data-testid={`remove-post-${p.pgpid}`} className="text-red-600 border-red-200 hover:bg-red-50 h-8" onClick={() => remove(p.post_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {p.drop_courses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[11px] uppercase text-red-600 font-semibold mr-1">Drop:</span>
                        {p.drop_courses.map((c) => <span key={c.course_id} className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">{c.course_name}</span>)}
                      </div>
                    )}
                    {p.add_sections?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[11px] uppercase text-emerald-700 font-semibold mr-1">Add:</span>
                        {p.add_sections.map((c) => <span key={c.section_id} className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{c.course_name} · Sec {c.section_name}</span>)}
                      </div>
                    )}
                    {p.note && <p className="text-sm text-muted-foreground italic">"{p.note}"</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
