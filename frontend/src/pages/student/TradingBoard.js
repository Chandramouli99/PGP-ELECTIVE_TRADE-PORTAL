import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Store, Save, Trash2, PlusCircle, MinusCircle, UserRound } from "lucide-react";

const cr = (n) => (n === 0.5 ? "0.5" : `${n}`);

function Chip({ active, onClick, children, tone = "default", testid }) {
  const base = "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer select-none";
  const styles = active
    ? tone === "drop" ? "bg-red-600 text-white border-red-600" : "bg-emerald-600 text-white border-emerald-600"
    : "bg-card text-foreground border-border hover:border-primary";
  return <button type="button" data-testid={testid} onClick={onClick} className={`${base} ${styles}`}>{children}</button>;
}

export default function TradingBoard() {
  const [board, setBoard] = useState(null);
  const [myCourses, setMyCourses] = useState([]);
  const [available, setAvailable] = useState([]);
  const [dropSel, setDropSel] = useState([]);
  const [addSel, setAddSel] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasPost, setHasPost] = useState(false);

  const loadAll = () => {
    api.get("/trading/board").then((r) => setBoard(r.data));
    api.get("/trading/mine").then((r) => {
      const p = r.data.post;
      setHasPost(!!p);
      if (p) { setDropSel(p.drop_course_ids || []); setAddSel(p.add_course_ids || []); setNote(p.note || ""); }
    });
  };

  useEffect(() => {
    api.get("/student/dashboard").then((r) => setMyCourses(r.data.courses));
    api.get("/student/available-courses").then((r) => setAvailable(r.data));
    loadAll();
  }, []);

  const toggle = (arr, setArr, id) => setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const notOwned = available.filter((c) => !myCourses.some((mc) => mc.course_id === c.course_id));

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/trading/posts", { drop_course_ids: dropSel, add_course_ids: addSel, note });
      toast.success("Your case is live on the trading board");
      loadAll();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save your case"); }
    finally { setSaving(false); }
  };

  const removeMine = async (postId) => {
    try {
      await api.delete(`/trading/posts/${postId}`);
      toast.success("Your case was removed");
      setDropSel([]); setAddSel([]); setNote(""); setHasPost(false);
      loadAll();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not remove"); }
  };

  if (!board) return <Layout title="Trading Board"><div /></Layout>;

  if (!board.enabled) {
    return (
      <Layout title="Trading Board">
        <Card className="shadow-sm max-w-2xl">
          <CardContent className="py-12 text-center">
            <Store className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">{board.message}</p>
            <p className="text-muted-foreground text-sm mt-2">The trading board is available only while the request window is open.</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const myPostId = board.posts.find((p) => p.is_mine)?.post_id;

  return (
    <Layout title="Trading Board">
      <div className="space-y-8">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Post the courses you want to <span className="text-red-600 font-medium">drop</span> and <span className="text-emerald-700 font-medium">add</span>.
          Your name and PGPID are visible to all students so anyone with a matching interest can reach out to you directly and then raise a swap. This is an informational board only.
        </p>

        {/* Your case editor */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> Your Case</CardTitle>
            <CardDescription>Select one or more courses. You can edit or delete your case anytime while the window is open.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="tiny-label mb-2 flex items-center gap-1"><MinusCircle className="h-3.5 w-3.5 text-red-600" /> Courses you want to DROP (your current courses)</p>
              <div className="flex flex-wrap gap-2">
                {myCourses.map((c) => (
                  <Chip key={c.course_id} tone="drop" active={dropSel.includes(c.course_id)} onClick={() => toggle(dropSel, setDropSel, c.course_id)} testid={`drop-chip-${c.course_code}`}>
                    {c.course_name} · Sec {c.section_name} · {cr(c.credits)}cr
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="tiny-label mb-2 flex items-center gap-1"><PlusCircle className="h-3.5 w-3.5 text-emerald-600" /> Courses you want to ADD (courses you don't have)</p>
              <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                {notOwned.map((c) => (
                  <Chip key={c.course_id} tone="add" active={addSel.includes(c.course_id)} onClick={() => toggle(addSel, setAddSel, c.course_id)} testid={`add-chip-${c.course_code}`}>
                    {c.course_name} · {cr(c.credits)}cr
                  </Chip>
                ))}
              </div>
            </div>
            <Textarea data-testid="trading-note" placeholder="Optional note (e.g. flexible on section, prefer morning slots)…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-3">
              <Button data-testid="save-case-button" onClick={save} disabled={saving || (dropSel.length === 0 && addSel.length === 0)} className="bg-primary hover:bg-primary/90">
                <Save className="h-4 w-4 mr-2" /> {hasPost ? "Update My Case" : "Post My Case"}
              </Button>
              {myPostId && (
                <Button variant="outline" data-testid="delete-case-button" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => removeMine(myPostId)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete My Case
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Board listing */}
        <div>
          <h3 className="text-xl font-semibold mb-3">Open Cases ({board.posts.length})</h3>
          {board.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases posted yet. Be the first to post yours.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {board.posts.map((p) => (
                <Card key={p.post_id} className={`shadow-sm ${p.is_mine ? "border-primary" : ""}`} data-testid={`trading-post-${p.pgpid}`}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><UserRound className="h-4 w-4 text-primary" /></div>
                      <div>
                        <p className="font-medium text-sm">{p.student_name} {p.is_mine && <span className="text-xs text-primary">(You)</span>}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.pgpid}</p>
                      </div>
                    </div>
                    {p.drop_courses.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-red-600 font-semibold mb-1">Wants to drop</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.drop_courses.map((c) => <span key={c.course_id} className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">{c.course_name}</span>)}
                        </div>
                      </div>
                    )}
                    {p.add_courses.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1">Wants to add</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.add_courses.map((c) => <span key={c.course_id} className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{c.course_name}</span>)}
                        </div>
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
