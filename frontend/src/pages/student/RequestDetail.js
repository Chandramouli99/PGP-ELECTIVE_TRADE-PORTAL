import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, REQUEST_TYPE_LABELS, STATUS_LABELS } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowLeft, CircleDot } from "lucide-react";

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [req, setReq] = useState(null);
  const [windowOpen, setWindowOpen] = useState(false);

  const load = () => api.get(`/student/requests/${id}`).then((r) => setReq(r.data)).catch(() => navigate("/requests"));
  useEffect(() => {
    load();
    api.get("/window").then((r) => setWindowOpen(r.data.is_open)).catch(() => {});
  }, [id]);

  const withdraw = async () => {
    try {
      await api.post(`/student/requests/${id}/cancel`);
      toast.success("Request withdrawn");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not withdraw"); }
  };

  if (!req) return <Layout title="Request Details"><div /></Layout>;
  const isSwap = req.request_type === "COURSE_SWAP" || req.request_type === "SECTION_SWAP";
  const canWithdraw = !isSwap && windowOpen && ["SUBMITTED", "UNDER_REVIEW"].includes(req.status);

  return (
    <Layout title="Request Details">
      <Button variant="ghost" className="mb-4" data-testid="back-to-requests" onClick={() => navigate("/requests")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to My Requests
      </Button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-mono">{req.request_id}</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">{REQUEST_TYPE_LABELS[req.request_type]}</p>
            </div>
            <StatusBadge status={req.status} />
          </CardHeader>
          <CardContent className="space-y-4">
            {req.actions?.length > 0 && (
              <div className="space-y-2">
                {req.actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.action === "ADD" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{a.action}</span>
                    <span className="font-medium">{a.course_name}</span>
                    <span className="text-muted-foreground">Section {a.section_name}</span>
                  </div>
                ))}
              </div>
            )}
            {req.swap && (
              <div className="rounded-md bg-secondary p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Swap partner:</span> <span className="font-medium">{req.swap.partner_name} ({req.swap.partner_pgpid})</span></p>
                <p><span className="text-muted-foreground">You give:</span> {req.swap.initiator_current.course_name} — Section {req.swap.initiator_current.section_name}</p>
                <p><span className="text-muted-foreground">You get:</span> {req.swap.initiator_requested.course_name} — Section {req.swap.initiator_requested.section_name}</p>
                <p><span className="text-muted-foreground">Partner confirmation:</span> {req.swap.partner_confirmed === true ? "Accepted" : req.swap.partner_confirmed === false ? "Rejected" : "Pending"}</p>
              </div>
            )}
            {req.credit_note && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠ {req.credit_note}</p>}
            {req.clash_note && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2" data-testid="detail-clash-note">⚠ {req.clash_note}</p>}
            {req.comment && <p className="text-sm"><span className="text-muted-foreground">Your comment:</span> {req.comment}</p>}
            {req.admin_comment && <p className="text-sm"><span className="text-muted-foreground">Admin comment:</span> {req.admin_comment}</p>}

            {canWithdraw ? (
              <Button variant="outline" data-testid="withdraw-request-button" className="text-red-600 border-red-200 hover:bg-red-50" onClick={withdraw}>
                Withdraw Request
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isSwap
                  ? "Swap requests cannot be withdrawn once submitted."
                  : !["SUBMITTED", "UNDER_REVIEW"].includes(req.status)
                    ? "This request can no longer be withdrawn."
                    : "The request window has closed — this request can no longer be withdrawn."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg">Status History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4" data-testid="status-history">
              {req.history.map((h, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <CircleDot className="h-4 w-4 text-primary" />
                    {i < req.history.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-medium">{STATUS_LABELS[h.status] || h.status}</p>
                    <p className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString()}</p>
                    {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
