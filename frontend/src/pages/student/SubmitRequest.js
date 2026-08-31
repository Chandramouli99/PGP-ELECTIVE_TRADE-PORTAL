import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PlusCircle, MinusCircle, Repeat, GitCompareArrows, ArrowLeftRight, Loader2, Search, AlertTriangle, Lock } from "lucide-react";

const TYPES = [
  { id: "COURSE_SWAP", label: "Course Swap", desc: "Exchange a course with another student.", icon: GitCompareArrows },
  { id: "SECTION_SWAP", label: "Section Swap", desc: "Swap sections in the same course.", icon: ArrowLeftRight },
  { id: "ADD", label: "Add a Course", desc: "Add a course without dropping another.", icon: PlusCircle },
  { id: "DROP", label: "Drop a Course", desc: "Drop one of your existing courses.", icon: MinusCircle },
  { id: "ADD_DROP", label: "Add + Drop", desc: "Add one course and drop another.", icon: Repeat },
];

const cr = (n) => (n === 0.5 ? "0.5 cr" : `${n} cr`);

export default function SubmitRequest() {
  const navigate = useNavigate();
  const [type, setType] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [available, setAvailable] = useState([]);
  const [quota, setQuota] = useState(null);
  const [windowOpen, setWindowOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({});
  const [partner, setPartner] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    api.get("/student/dashboard").then((r) => { setDashboard(r.data); setWindowOpen(r.data.window.is_open); });
    api.get("/student/available-courses").then((r) => setAvailable(r.data));
    api.get("/student/quota").then((r) => setQuota(r.data));
  }, []);

  const myCourses = dashboard?.courses || [];
  const myCredits = myCourses.reduce((s, c) => s + (c.credits || 0), 0);
  const ruleApplies = dashboard?.program === "PGP" && !dashboard?.stex;
  const creditMin = dashboard?.credit_min ?? 5;
  const creditMax = dashboard?.credit_max ?? 6;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const sectionsFor = (courseId) => available.find((c) => c.course_id === courseId)?.sections || [];
  const giveCourse = myCourses.find((c) => c.course_id === form.give_course_id);

  const exhausted = quota ? {
    COURSE_SWAP: quota.course_swap_used >= quota.course_swap_limit,
    SECTION_SWAP: quota.section_swap_used >= quota.section_swap_limit,
    ADD: quota.add_used >= quota.add_limit,
    DROP: quota.drop_used >= quota.drop_limit,
    ADD_DROP: quota.add_drop_used >= quota.add_drop_limit,
  } : {};
  const usageLabel = quota ? {
    COURSE_SWAP: `${quota.course_swap_used}/${quota.course_swap_limit} used`,
    SECTION_SWAP: `${quota.section_swap_used}/${quota.section_swap_limit} used`,
    ADD: `${quota.add_used}/${quota.add_limit} used`,
    DROP: `${quota.drop_used}/${quota.drop_limit} used`,
    ADD_DROP: `${quota.add_drop_used}/${quota.add_drop_limit} used`,
  } : {};

  const projectedCredits = () => {
    let p = myCredits;
    if (type === "DROP" || type === "ADD_DROP") { const c = myCourses.find((x) => x.course_id === form.drop_course_id); if (c) p -= c.credits || 0; }
    if (type === "ADD" || type === "ADD_DROP") { const c = available.find((x) => x.course_id === form.add_course_id); if (c) p += c.credits || 0; }
    return Math.round(p * 10) / 10;
  };

  const creditWarning = () => {
    if (!ruleApplies || !["ADD", "DROP", "ADD_DROP"].includes(type)) return null;
    const hasAdd = (type === "ADD" || type === "ADD_DROP") ? form.add_course_id : true;
    const hasDrop = (type === "DROP" || type === "ADD_DROP") ? form.drop_course_id : true;
    if (!hasAdd || !hasDrop) return null;
    const p = projectedCredits();
    if (p > creditMax) return `This will put you at ${p} credits — above the Term V maximum of ${creditMax}.`;
    if (p < creditMin) return `This will put you at ${p} credits — below the Term V minimum of ${creditMin}.`;
    return null;
  };

  const clashWarning = () => {
    let sec = null, excludeCourseId = null;
    if (type === "ADD" || type === "ADD_DROP") {
      sec = sectionsFor(form.add_course_id).find((s) => s.section_id === form.add_section_id);
      if (type === "ADD_DROP") excludeCourseId = form.drop_course_id;
    } else if (type === "COURSE_SWAP") {
      sec = partner?.courses.find((c) => c.course_id === form.want_course_id);
      excludeCourseId = form.give_course_id;
    } else if (type === "SECTION_SWAP") {
      sec = partner?.courses.find((c) => c.course_id === form.swap_course_id);
      excludeCourseId = form.swap_course_id;
    }
    if (!sec || !sec.day || sec.day === "Not timetabled" || !sec.time_slot || sec.time_slot === "—") return null;
    const clashes = myCourses.filter((c) => c.course_id !== excludeCourseId && c.day === sec.day && c.time_slot === sec.time_slot);
    if (clashes.length) return `Time clash on ${sec.day} ${sec.time_slot} with: ${clashes.map((c) => c.course_name).join(", ")}.`;
    return null;
  };

  const warnings = [creditWarning(), clashWarning()].filter(Boolean);

  const lookupPartner = async () => {
    if (!form.partner_pgpid) return;
    setLookupBusy(true); setPartner(null);
    try {
      const { data } = await api.get(`/student/lookup-partner`, { params: { pgpid: form.partner_pgpid } });
      setPartner(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Partner not found"); }
    finally { setLookupBusy(false); }
  };

  const doSubmit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const payload = { request_type: type, comment: form.comment };
      if (type === "ADD") { payload.add_course_id = form.add_course_id; payload.add_section_id = form.add_section_id; }
      if (type === "DROP") { const c = myCourses.find((x) => x.course_id === form.drop_course_id); payload.drop_course_id = form.drop_course_id; payload.drop_section_id = c?.section_id; }
      if (type === "ADD_DROP") { const c = myCourses.find((x) => x.course_id === form.drop_course_id); payload.drop_course_id = form.drop_course_id; payload.drop_section_id = c?.section_id; payload.add_course_id = form.add_course_id; payload.add_section_id = form.add_section_id; }
      if (type === "COURSE_SWAP") { payload.partner_pgpid = form.partner_pgpid; payload.give_section_ids = form.give_secs || []; payload.want_section_ids = form.want_secs || []; }
      if (type === "SECTION_SWAP") { const mine = myCourses.find((x) => x.course_id === form.swap_course_id); const pr = partner?.courses.find((x) => x.course_id === form.swap_course_id); payload.partner_pgpid = form.partner_pgpid; payload.swap_course_id = form.swap_course_id; payload.my_section_id = mine?.section_id; payload.requested_section_id = pr?.section_id; }
      const res = await api.post("/student/requests", payload);
      toast.success("Your request has been submitted successfully.");
      if (res.data?.priority_note) toast.info(res.data.priority_note, { duration: 9000 });
      navigate("/requests");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not submit request"); }
    finally { setSubmitting(false); }
  };

  const handleSubmitClick = () => {
    if (warnings.length) { setConfirmOpen(true); return; }
    doSubmit();
  };

  if (!windowOpen) {
    return (
      <Layout title="Submit a Course Request">
        <Card className="shadow-sm max-w-2xl">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium">{dashboard?.window?.message || "Course change requests are currently closed."}</p>
            <p className="text-muted-foreground text-sm mt-2">You cannot submit new requests outside the active request window.</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const wantOptions = partner ? partner.courses.filter((pc) =>
    !myCourses.some((mc) => mc.course_id === pc.course_id) &&
    pc.course_id !== form.give_course_id &&
    (!giveCourse || pc.credits === giveCourse.credits)
  ) : [];

  return (
    <Layout title="Submit a Course Request">
      {!type ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 max-w-5xl">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const isOut = exhausted[t.id];
            return (
              <button
                key={t.id}
                disabled={isOut}
                data-testid={`request-type-${t.id}`}
                onClick={() => { if (isOut) return; setType(t.id); setForm({}); setPartner(null); }}
                className={`text-left bg-card border rounded-lg p-6 transition-colors ${isOut ? "opacity-60 cursor-not-allowed" : "hover:border-primary hover:shadow-sm"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="h-11 w-11 rounded-md bg-primary/10 flex items-center justify-center mb-4"><Icon className="h-5 w-5 text-primary" /></div>
                  {quota && (
                    isOut
                      ? <span className="flex items-center gap-1 text-xs font-medium text-red-600" data-testid={`limit-${t.id}`}><Lock className="h-3 w-3" /> Limit reached</span>
                      : <span className="text-xs text-muted-foreground">{usageLabel[t.id]}</span>
                  )}
                </div>
                <p className="font-semibold text-lg">{t.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="shadow-sm max-w-2xl">
          <CardHeader>
            <CardTitle>{TYPES.find((t) => t.id === type).label}</CardTitle>
            <CardDescription>{TYPES.find((t) => t.id === type).desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(type === "ADD" || type === "ADD_DROP") && (
              <>
                {type === "ADD_DROP" && (
                  <div className="space-y-2">
                    <Label className="tiny-label">Course to Drop</Label>
                    <Select onValueChange={(v) => set("drop_course_id", v)}>
                      <SelectTrigger data-testid="select-drop-course"><SelectValue placeholder="Select a course you're enrolled in" /></SelectTrigger>
                      <SelectContent>
                        {myCourses.map((c) => (<SelectItem key={c.course_id} value={c.course_id}>{c.course_name} — Sec {c.section_name} · {cr(c.credits)}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="tiny-label">Course to Add</Label>
                  <Select onValueChange={(v) => { set("add_course_id", v); set("add_section_id", null); }}>
                    <SelectTrigger data-testid="select-add-course"><SelectValue placeholder="Select a course" /></SelectTrigger>
                    <SelectContent>
                      {available.filter((c) => !myCourses.some((mc) => mc.course_id === c.course_id)).map((c) => (<SelectItem key={c.course_id} value={c.course_id}>{c.course_name} · {cr(c.credits)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {form.add_course_id && (
                  <div className="space-y-2">
                    <Label className="tiny-label">Preferred Section</Label>
                    <Select onValueChange={(v) => set("add_section_id", v)}>
                      <SelectTrigger data-testid="select-add-section"><SelectValue placeholder="Select a section" /></SelectTrigger>
                      <SelectContent>
                        {sectionsFor(form.add_course_id).map((s) => (<SelectItem key={s.section_id} value={s.section_id}>Section {s.section_name}{s.day && s.day !== "Not timetabled" ? ` · ${s.day} ${s.time_slot}` : ""}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {type === "DROP" && (
              <div className="space-y-2">
                <Label className="tiny-label">Course to Drop</Label>
                <Select onValueChange={(v) => set("drop_course_id", v)}>
                  <SelectTrigger data-testid="select-drop-course"><SelectValue placeholder="Select a course to drop" /></SelectTrigger>
                  <SelectContent>
                    {myCourses.map((c) => (<SelectItem key={c.course_id} value={c.course_id}>{c.course_name} — Sec {c.section_name} · {cr(c.credits)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {warnings.length > 0 && (
              <div data-testid="request-warning" className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 p-3 text-sm space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{w}</span></div>
                ))}
                <p className="text-xs pl-6">You can still submit, but it may not be approved.</p>
              </div>
            )}

            {(type === "COURSE_SWAP" || type === "SECTION_SWAP") && (
              <div className="space-y-2">
                <Label className="tiny-label">Swap Partner PGPID</Label>
                <div className="flex gap-2">
                  <Input data-testid="input-partner-pgpid" placeholder="e.g. PGP41072" value={form.partner_pgpid || ""} onChange={(e) => { set("partner_pgpid", e.target.value.toUpperCase()); setPartner(null); }} />
                  <Button variant="outline" data-testid="lookup-partner-button" onClick={lookupPartner} disabled={lookupBusy}>
                    {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {partner && <p className="text-sm text-emerald-700">Swap partner: <span className="font-medium">{partner.name}</span> ({partner.pgpid})</p>}
              </div>
            )}

            {type === "COURSE_SWAP" && partner && (() => {
              const giveSel = form.give_secs || [];
              const wantSel = form.want_secs || [];
              const receiveOpts = partner.courses.filter((pc) => !myCourses.some((mc) => mc.course_id === pc.course_id));
              const offered = Math.round(myCourses.filter((c) => giveSel.includes(c.section_id)).reduce((s, c) => s + (c.credits || 0), 0) * 10) / 10;
              const wanted = Math.round(receiveOpts.filter((c) => wantSel.includes(c.section_id)).reduce((s, c) => s + (c.credits || 0), 0) * 10) / 10;
              const tgl = (key, id) => set(key, (form[key] || []).includes(id) ? (form[key] || []).filter((x) => x !== id) : [...(form[key] || []), id]);
              return (
                <div className="space-y-4">
                  <div>
                    <Label className="tiny-label mb-2 block">Courses you OFFER (select one or more)</Label>
                    <div className="flex flex-wrap gap-2">
                      {myCourses.map((c) => (<button type="button" key={c.section_id} data-testid={`give-chip-${c.course_code}`} onClick={() => tgl("give_secs", c.section_id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${giveSel.includes(c.section_id) ? "bg-red-600 text-white border-red-600" : "bg-card hover:border-primary"}`}>{c.course_name} · {cr(c.credits)}cr</button>))}
                    </div>
                  </div>
                  <div>
                    <Label className="tiny-label mb-2 block">Partner's courses you RECEIVE (select one or more)</Label>
                    <div className="flex flex-wrap gap-2">
                      {receiveOpts.map((c) => (<button type="button" key={c.section_id} data-testid={`want-chip-${c.course_code}`} onClick={() => tgl("want_secs", c.section_id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${wantSel.includes(c.section_id) ? "bg-emerald-600 text-white border-emerald-600" : "bg-card hover:border-primary"}`}>{c.course_name} · Sec {c.section_name} · {cr(c.credits)}cr</button>))}
                    </div>
                  </div>
                  <div className={`text-sm rounded-md p-3 border ${offered === wanted && offered > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid="credit-balance">
                    Offering <b>{offered}</b> credits · Receiving <b>{wanted}</b> credits {offered === wanted && offered > 0 ? "— balanced ✓ (you can combine e.g. two 0.5-credit courses for one 1-credit)" : "— totals must match"}
                  </div>
                </div>
              );
            })()}

            {type === "SECTION_SWAP" && partner && (
              <div className="space-y-2">
                <Label className="tiny-label">Course (same course, swap sections)</Label>
                <Select onValueChange={(v) => set("swap_course_id", v)}>
                  <SelectTrigger data-testid="select-swap-course"><SelectValue placeholder="Select a shared course" /></SelectTrigger>
                  <SelectContent>
                    {myCourses.filter((mc) => partner.courses.some((pc) => pc.course_id === mc.course_id && pc.section_id !== mc.section_id)).map((c) => (<SelectItem key={c.course_id} value={c.course_id}>{c.course_name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {form.swap_course_id && (
                  <div className="rounded-md bg-secondary p-4 text-sm mt-2">
                    <p>Your section: <span className="font-medium">{myCourses.find((c) => c.course_id === form.swap_course_id)?.section_name}</span></p>
                    <p>Partner's section (you'll request): <span className="font-medium">{partner.courses.find((c) => c.course_id === form.swap_course_id)?.section_name}</span></p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="tiny-label">Reason / Comment (optional)</Label>
              <Textarea data-testid="input-comment" placeholder="Add any context for the administrator" value={form.comment || ""} onChange={(e) => set("comment", e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">{(type === "COURSE_SWAP" || type === "SECTION_SWAP") ? "Note: swap requests cannot be withdrawn once submitted." : "Note: you can withdraw this request any time while the request window is open."}</p>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" data-testid="back-button" onClick={() => setType(null)}>Back</Button>
              <Button data-testid="submit-request-button" onClick={handleSubmitClick} disabled={submitting} className="bg-primary hover:bg-primary/90">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="warning-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Please review before submitting</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                {warnings.map((w, i) => (<div key={i}>• {w}</div>))}
                <div className="pt-1">You can still submit this request, but it may not be approved.{(type === "COURSE_SWAP" || type === "SECTION_SWAP") ? " Swap requests cannot be withdrawn once submitted." : ""}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="warning-confirm-cancel">Go Back</AlertDialogCancel>
            <AlertDialogAction data-testid="warning-confirm-submit" onClick={doSubmit} className="bg-primary hover:bg-primary/90">Submit Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
