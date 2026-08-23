import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Store, Save, Trash2, PlusCircle, MinusCircle, UserRound, Pencil } from "lucide-react";

const cr = (n) => (n === 0.5 ? "0.5" : `${n}`);

function Chip({ active, onClick, children, tone, testid }) {
  const styles = active
    ? tone === "drop" ? "bg-red-600 text-white border-red-600" : "bg-emerald-600 text-white border-emerald-600"
    : "bg-card text-foreground border-border hover:border-primary";
  return <button type="button" data-testid={testid} onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer select-none ${styles}`}>{children}</button>;
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
  const [editorOpen, setEditorOpen] = useState(false);

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
      setEditorOpen(false);
      loadAll();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save your case"); }
    finally { setSaving(false); }
  };

  const removeMine = async (postId) => {
    try {
      await api.delete(`/trading/posts/${postId}`);
      toast.success("Your case was removed");
      setDropSel([]); setAddSel([]); setNote(""); setHasPost(false); setEditorOpen(false);
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
      <div className="space-y-6">
        {/* Intro + primary action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-primary/5 border rounded-lg p-5">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> Course Trading Board</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Browse what other students want to drop or add. Contact them directly (name &amp; PGPID shown) and raise a swap. Informational only — no section capacity is shown.
            </p>
          </div>
          <Button data-testid="open-case-editor-button" className="bg-primary hover:bg-primary/90 shrink-0" onClick={() => setEditorOpen(true)}>
            {hasPost ? <><Pencil className="h-4 w-4 mr-2" /> Edit My Case</> : <><PlusCircle className="h-4 w-4 mr-2" /> Create Your Own Case</>}
          </Button>
        </div>

        {/* Board listing first */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Open Cases ({board.posts.length})</h3>
          {board.posts.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="py-10 text-center text-muted-foreground text-sm">No cases posted yet. Be the first — tap "Create Your Own Case".</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {board.posts.map((p) => (
                <Card key={p.post_id} className={`shadow-sm ${p.is_mine ? "border-primary ring-1 ring-primary/20" : ""}`} data-testid={`trading-post-${p.pgpid}`}>
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
                        <div className="flex flex-wrap gap-1.5">{p.drop_courses.map((c) => <span key={c.course_id} className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">{c.course_name}</span>)}</div>
                      </div>
                    )}
                    {p.add_courses.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1">Wants to add</p>
                        <div className="flex flex-wrap gap-1.5">{p.add_courses.map((c) => <span key={c.course_id} className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{c.course_name}</span>)}</div>
                      </div>
                    )}
                    {p.note && <p className="text-sm text-muted-foreground italic">"{p.note}"</p>}
                    {p.is_mine && (
                      <Button size="sm" variant="outline" className="h-8" data-testid="edit-my-post" onClick={() => setEditorOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="case-editor-dialog">
          <DialogHeader>
            <DialogTitle>{hasPost ? "Edit Your Case" : "Create Your Case"}</DialogTitle>
            <DialogDescription>Select one or more courses to list. You can edit or delete anytime while the window is open.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <p className="tiny-label mb-2 flex items-center gap-1"><MinusCircle className="h-3.5 w-3.5 text-red-600" /> Courses you want to DROP</p>
              <div className="flex flex-wrap gap-2">
                {myCourses.map((c) => (
                  <Chip key={c.course_id} tone="drop" active={dropSel.includes(c.course_id)} onClick={() => toggle(dropSel, setDropSel, c.course_id)} testid={`drop-chip-${c.course_code}`}>
                    {c.course_name} · Sec {c.section_name} · {cr(c.credits)}cr
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="tiny-label mb-2 flex items-center gap-1"><PlusCircle className="h-3.5 w-3.5 text-emerald-600" /> Courses you want to ADD</p>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {notOwned.map((c) => (
                  <Chip key={c.course_id} tone="add" active={addSel.includes(c.course_id)} onClick={() => toggle(addSel, setAddSel, c.course_id)} testid={`add-chip-${c.course_code}`}>
                    {c.course_name} · {cr(c.credits)}cr
                  </Chip>
                ))}
              </div>
            </div>
            <Textarea data-testid="trading-note" placeholder="Optional note (e.g. flexible on section, prefer morning slots)…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            {myPostId && (
              <Button variant="outline" data-testid="delete-case-button" className="text-red-600 border-red-200 hover:bg-red-50 mr-auto" onClick={() => removeMine(myPostId)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button data-testid="save-case-button" onClick={save} disabled={saving || (dropSel.length === 0 && addSel.length === 0)} className="bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4 mr-2" /> {hasPost ? "Update" : "Post Case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
