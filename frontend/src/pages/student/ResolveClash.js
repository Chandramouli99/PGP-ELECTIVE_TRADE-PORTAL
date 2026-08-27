import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, X, Plus, CheckCircle2, Trash2 } from "lucide-react";

const round1 = (n) => Math.round(n * 10) / 10;
const prefTotal = (items) => round1(items.reduce((s, i) => s + (i.credits || 0), 0));

function PrefCard({ index, items, options, required, onAdd, onRemoveItem, onRemovePref, canRemovePref }) {
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const total = prefTotal(items);
  const complete = items.length > 0 && total === required;
  const avail = options.courses.filter((c) => !items.some((x) => x.course_id === c.course_id));
  const course = avail.find((c) => c.course_id === courseId);

  const add = () => {
    if (!courseId || !sectionId) return;
    onAdd(index, courseId, sectionId);
    setCourseId(""); setSectionId("");
  };

  return (
    <Card className={`shadow-sm ${complete ? "border-emerald-300" : "border-border"}`} data-testid={`pref-card-${index}`}>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          Preference {index + 1}
          {complete && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        </CardTitle>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${total === required ? "text-emerald-700" : "text-muted-foreground"}`} data-testid={`pref-total-${index}`}>
            {total} / {required} cr
          </span>
          {canRemovePref && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" data-testid={`remove-pref-${index}`} onClick={() => onRemovePref(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {items.map((it, ci) => (
              <span key={ci} data-testid={`pref-${index}-item-${it.course_code}`} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-sm">
                {it.course_name} · Sec {it.section_name} · {it.credits}cr
                <button onClick={() => onRemoveItem(index, ci)} data-testid={`pref-${index}-remove-${it.course_code}`} className="hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="flex-1">
            <Select value={courseId} onValueChange={(v) => { setCourseId(v); setSectionId(""); }}>
              <SelectTrigger data-testid={`pref-${index}-course-select`}><SelectValue placeholder="Choose a replacement course" /></SelectTrigger>
              <SelectContent>
                {avail.length === 0 ? <div className="px-3 py-2 text-sm text-muted-foreground">No eligible courses</div> :
                  avail.map((c) => <SelectItem key={c.course_id} value={c.course_id}>{c.course_name} ({c.credits}cr)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Select value={sectionId} onValueChange={setSectionId} disabled={!course}>
              <SelectTrigger data-testid={`pref-${index}-section-select`}><SelectValue placeholder="Section" /></SelectTrigger>
              <SelectContent>
                {course?.sections.map((s) => (
                  <SelectItem key={s.section_id} value={s.section_id}>Sec {s.section_name}{s.day && s.day !== "Not timetabled" ? ` · ${s.day} ${s.time_slot}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!courseId || !sectionId} onClick={add} data-testid={`pref-${index}-add-item`}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {items.length > 0 && total !== required && (
          <p className="text-xs text-amber-600">Add courses so the credits total exactly {required}.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResolveClash() {
  const navigate = useNavigate();
  const [clashes, setClashes] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  const [dropSectionId, setDropSectionId] = useState(null);
  const [options, setOptions] = useState(null);
  const [prefs, setPrefs] = useState([[], []]);
  const [submitting, setSubmitting] = useState(false);

  const loadClashes = useCallback(() => api.get("/student/clashes").then((r) => setClashes(r.data.clashes || [])).catch(() => setClashes([])), []);
  useEffect(() => { loadClashes(); }, [loadClashes]);

  const clash = clashes && clashes[selIdx];

  const chooseDrop = async (sectionId) => {
    setDropSectionId(sectionId);
    setPrefs([[], []]);
    setOptions(null);
    try {
      const r = await api.get(`/student/clash-options?drop_section_id=${sectionId}`);
      setOptions(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not load replacement options"); }
  };

  const required = options?.required_credits || 0;

  const addItem = (pi, courseId, sectionId) => {
    const course = options.courses.find((c) => c.course_id === courseId);
    const sec = course?.sections.find((s) => s.section_id === sectionId);
    if (!course || !sec) return;
    setPrefs((prev) => prev.map((items, i) => {
      if (i !== pi) return items;
      if (items.some((x) => x.course_id === courseId)) { toast.error("That course is already in this preference"); return items; }
      return [...items, { course_id: courseId, section_id: sectionId, course_name: course.course_name, course_code: course.course_code, section_name: sec.section_name, credits: course.credits }];
    }));
  };
  const removeItem = (pi, ci) => setPrefs((prev) => prev.map((items, i) => (i === pi ? items.filter((_, k) => k !== ci) : items)));
  const addPref = () => setPrefs((prev) => [...prev, []]);
  const removePref = (pi) => setPrefs((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== pi)));

  const allValid = dropSectionId && prefs.length >= 2 && prefs.every((items) => items.length > 0 && prefTotal(items) === required);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/student/clash/resolve", { drop_section_id: dropSectionId, preferences: prefs.map((items) => items.map((i) => i.section_id)) });
      toast.success("Clash-resolution request submitted for admin approval");
      navigate("/requests");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not submit request"); }
    setSubmitting(false);
  };

  if (clashes === null) return <Layout title="Resolve Clash"><div /></Layout>;

  if (clashes.length === 0) {
    return (
      <Layout title="Resolve Clash">
        <Card className="shadow-sm" data-testid="no-clash-card">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-medium text-lg">No timetable clashes</p>
            <p className="text-muted-foreground text-sm mt-1">Your schedule has no overlapping classes. Nothing to resolve here.</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Resolve Clash">
      <div className="space-y-6 max-w-4xl">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3" data-testid="resolve-clash-header">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">You have a timetable clash</p>
            <p className="text-sm text-red-700 mt-0.5">Drop one of the clashing courses and give at least two replacement preferences (equal total credits). The academic office will approve one of them.</p>
          </div>
        </div>

        {clashes.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {clashes.map((c, i) => (
              <Button key={i} size="sm" variant={i === selIdx ? "default" : "outline"} data-testid={`clash-tab-${i}`}
                onClick={() => { setSelIdx(i); setDropSectionId(null); setOptions(null); setPrefs([[], []]); }}>
                {c.day} {c.time_slot}
              </Button>
            ))}
          </div>
        )}

        {/* Step 1: choose which course to drop */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg">1. Which course do you want to drop?</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Clash on <span className="font-medium text-foreground">{clash.day} · {clash.time_slot}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clash.courses.map((c) => (
                <button
                  key={c.section_id}
                  data-testid={`drop-choice-${c.course_code}`}
                  onClick={() => chooseDrop(c.section_id)}
                  className={`text-left rounded-lg border p-4 transition-colors ${dropSectionId === c.section_id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-secondary"}`}
                >
                  <p className="font-medium">{c.course_name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{c.course_code} · Sec {c.section_name} · {c.credits} cr</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: preferences */}
        {dropSectionId && options && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">2. Replacement preferences</CardTitle>
              <p className="text-sm text-muted-foreground">Each preference must total exactly <span className="font-medium text-foreground">{required} credits</span> and only shows courses that won't create a new clash.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {prefs.map((items, i) => (
                <PrefCard
                  key={i} index={i} items={items} options={options} required={required}
                  onAdd={addItem} onRemoveItem={removeItem} onRemovePref={removePref} canRemovePref={prefs.length > 2}
                />
              ))}
              <Button variant="outline" onClick={addPref} data-testid="add-preference-button">
                <Plus className="h-4 w-4 mr-1" /> Add another preference
              </Button>
            </CardContent>
          </Card>
        )}

        {dropSectionId && options && (
          <div className="flex justify-end">
            <Button disabled={!allValid || submitting} onClick={submit} data-testid="submit-clash-request" className="bg-primary hover:bg-primary/90">
              {submitting ? "Submitting..." : "Submit Clash-Resolution Request"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
