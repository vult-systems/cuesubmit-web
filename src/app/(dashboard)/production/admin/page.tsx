"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Upload,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  Film,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { iconButton } from "@/lib/icon-button-styles";
import { getIconButtonClass } from "@/lib/icon-button-styles";
import { GroupedSection } from "@/components/grouped-section";
import { accentColors } from "@/lib/accent-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────

interface Act {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

interface Shot {
  id: number;
  act_id: number;
  code: string;
  frame_start: number;
  frame_end: number;
  thumbnail: string | null;
  notes: string | null;
  act_code: string;
  act_name: string;
  combined_code: string;
}

// ─── Constants ─────────────────────────────────────────

const actAccents = [accentColors.blue, accentColors.amber, accentColors.emerald, accentColors.purple, accentColors.rose];

// ─── Main Admin Page ──────────────────────────────────

export default function ProductionAdminPage() {
  const [acts, setActs] = useState<Act[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  // Act dialogs
  const [createActOpen, setCreateActOpen] = useState(false);
  const [editActOpen, setEditActOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<Act | null>(null);
  const [actCode, setActCode] = useState("");
  const [actName, setActName] = useState("");
  const [actSaving, setActSaving] = useState(false);

  // Shot dialogs
  const [createShotOpen, setCreateShotOpen] = useState(false);
  const [editShotOpen, setEditShotOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [shotCode, setShotCode] = useState("");
  const [shotActId, setShotActId] = useState<string>("");
  const [shotFrameStart, setShotFrameStart] = useState("1001");
  const [shotFrameEnd, setShotFrameEnd] = useState("1120");
  const [shotNotes, setShotNotes] = useState("");
  const [shotSaving, setShotSaving] = useState(false);

  // Thumbnail upload
  const [uploadShotId, setUploadShotId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  // Delete confirmation
  const [deleteActId, setDeleteActId] = useState<number | null>(null);
  const [deleteActShotCount, setDeleteActShotCount] = useState(0);
  const [deleteShotId, setDeleteShotId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Data Fetching ──────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [actsRes, shotsRes, sessionRes] = await Promise.all([
        fetch("/api/production/acts"),
        fetch("/api/production/shots"),
        fetch("/api/auth/session"),
      ]);

      if (!actsRes.ok || !shotsRes.ok) throw new Error("Failed to fetch");
      const [actsData, shotsData] = await Promise.all([actsRes.json(), shotsRes.json()]);

      setActs(actsData.acts || []);
      setShots(shotsData.shots || []);

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setCanManage(session.user?.role === "admin" || session.user?.role === "manager");
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Act CRUD ───────────────────────────────────────

  const handleCreateAct = useCallback(async () => {
    setActSaving(true);
    try {
      const res = await fetch("/api/production/acts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: actCode.toLowerCase(), name: actName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create act");
      }
      toast.success(`Created ${actCode}`);
      setCreateActOpen(false);
      setActCode("");
      setActName("");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create act");
    } finally {
      setActSaving(false);
    }
  }, [actCode, actName, fetchData]);

  const handleUpdateAct = useCallback(async () => {
    if (!editingAct) return;
    setActSaving(true);
    try {
      const res = await fetch(`/api/production/acts/${editingAct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: actCode.toLowerCase(), name: actName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      toast.success("Act updated");
      setEditActOpen(false);
      setEditingAct(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update act");
    } finally {
      setActSaving(false);
    }
  }, [editingAct, actCode, actName, fetchData]);

  const handleDeleteAct = useCallback(async () => {
    if (deleteActId === null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/production/acts/${deleteActId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Act deleted");
      setDeleteActId(null);
      fetchData();
    } catch {
      toast.error("Failed to delete act");
    } finally {
      setDeleting(false);
    }
  }, [deleteActId, fetchData]);

  const handleReorderAct = useCallback(async (actId: number, direction: "up" | "down") => {
    const idx = acts.findIndex(a => a.id === actId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= acts.length) return;

    const other = acts[swapIdx];
    try {
      await Promise.all([
        fetch(`/api/production/acts/${actId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: other.sort_order }),
        }),
        fetch(`/api/production/acts/${other.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: acts[idx].sort_order }),
        }),
      ]);
      fetchData();
    } catch {
      toast.error("Failed to reorder");
    }
  }, [acts, fetchData]);

  // ─── Shot CRUD ──────────────────────────────────────

  const handleCreateShot = useCallback(async () => {
    setShotSaving(true);
    try {
      const res = await fetch("/api/production/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          act_id: Number(shotActId),
          code: shotCode.toLowerCase(),
          frame_start: Number(shotFrameStart),
          frame_end: Number(shotFrameEnd),
          notes: shotNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create shot");
      }
      toast.success(`Created ${shotCode}`);
      setCreateShotOpen(false);
      resetShotForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create shot");
    } finally {
      setShotSaving(false);
    }
  }, [shotActId, shotCode, shotFrameStart, shotFrameEnd, shotNotes, fetchData]);

  const handleUpdateShot = useCallback(async () => {
    if (!editingShot) return;
    setShotSaving(true);
    try {
      const res = await fetch(`/api/production/shots/${editingShot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          act_id: Number(shotActId),
          code: shotCode.toLowerCase(),
          frame_start: Number(shotFrameStart),
          frame_end: Number(shotFrameEnd),
          notes: shotNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update shot");
      }
      toast.success("Shot updated");
      setEditShotOpen(false);
      setEditingShot(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update shot");
    } finally {
      setShotSaving(false);
    }
  }, [editingShot, shotActId, shotCode, shotFrameStart, shotFrameEnd, shotNotes, fetchData]);

  const handleDeleteShot = useCallback(async () => {
    if (deleteShotId === null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/production/shots/${deleteShotId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Shot deleted");
      setDeleteShotId(null);
      fetchData();
    } catch {
      toast.error("Failed to delete shot");
    } finally {
      setDeleting(false);
    }
  }, [deleteShotId, fetchData]);

  // ─── Thumbnail Upload ──────────────────────────────

  const handleThumbnailUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadShotId === null) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("thumbnail", file);
      const res = await fetch(`/api/production/shots/${uploadShotId}/thumbnail`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload");
      }
      toast.success("Thumbnail uploaded");
      setUploadShotId(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  }, [uploadShotId, fetchData]);

  // ─── Helpers ────────────────────────────────────────

  function resetShotForm() {
    setShotCode("");
    setShotActId(acts[0]?.id.toString() || "");
    setShotFrameStart("1001");
    setShotFrameEnd("1120");
    setShotNotes("");
  }

  function openEditAct(act: Act) {
    setEditingAct(act);
    setActCode(act.code);
    setActName(act.name);
    setEditActOpen(true);
  }

  function openEditShot(shot: Shot) {
    setEditingShot(shot);
    setShotCode(shot.code);
    setShotActId(shot.act_id.toString());
    setShotFrameStart(shot.frame_start.toString());
    setShotFrameEnd(shot.frame_end.toString());
    setShotNotes(shot.notes || "");
    setEditShotOpen(true);
  }

  function openCreateShot(actId?: number) {
    resetShotForm();
    if (actId) setShotActId(actId.toString());
    setCreateShotOpen(true);
  }

  function getShotsForAct(actId: number) {
    return shots.filter(s => s.act_id === actId);
  }

  // ─── Loading ────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-64 rounded bg-surface-muted animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-surface-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <AlertCircle className="h-12 w-12 text-danger mb-4" />
        <p className="text-sm text-text-muted mb-4">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm">Try Again</Button>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <AlertCircle className="h-12 w-12 text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
        <p className="text-sm text-text-muted">Admin access requires admin or manager role.</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/production">
            <button className={iconButton.logsSmall}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Production Admin</h1>
            <p className="text-xs text-text-muted">Manage acts, shots, and thumbnails</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-text-muted">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
          <Button onClick={() => { setActCode(""); setActName(""); setCreateActOpen(true); }} size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Act
          </Button>
        </div>
      </div>

      {/* Acts */}
      {acts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
          <Film className="h-10 w-10 text-text-muted mb-3" />
          <p className="text-sm text-text-muted mb-4">No acts created yet</p>
          <Button onClick={() => { setActCode("act01"); setActName(""); setCreateActOpen(true); }} size="sm" className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create First Act
          </Button>
        </div>
      ) : (
        acts.map((act, actIdx) => {
          const actShots = getShotsForAct(act.id);
          return (
            <GroupedSection
              key={act.id}
              title={`${act.code} — ${act.name}`}
              badge={`${actShots.length} shots`}
              accentColors={actAccents[actIdx % actAccents.length]}
              defaultOpen={true}
              rightContent={
                <div className="flex items-center gap-1">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleReorderAct(act.id, "up")}
                          disabled={actIdx === 0}
                          className={cn(getIconButtonClass("neutral", "sm"), actIdx === 0 && "opacity-30 pointer-events-none")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Move up</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleReorderAct(act.id, "down")}
                          disabled={actIdx === acts.length - 1}
                          className={cn(getIconButtonClass("neutral", "sm"), actIdx === acts.length - 1 && "opacity-30 pointer-events-none")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Move down</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button onClick={() => openEditAct(act)} className={iconButton.edit}>
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => { setDeleteActId(act.id); setDeleteActShotCount(actShots.length); }}
                    className={iconButton.delete}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <Button onClick={() => openCreateShot(act.id)} size="sm" variant="outline" className="h-7 text-[10px] gap-1 ml-1">
                    <Plus className="h-3 w-3" />
                    Shot
                  </Button>
                </div>
              }
            >
              <div className="p-3">
                {actShots.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">No shots in this act</p>
                ) : (
                  <div className="space-y-1">
                    {actShots.map(shot => (
                      <div
                        key={shot.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/50 dark:hover:bg-white/2 transition-colors group"
                      >
                        {/* Thumbnail preview */}
                        <div className="w-16 h-9 rounded bg-surface-muted border border-border-muted flex items-center justify-center overflow-hidden shrink-0 text-[8px] text-text-muted font-mono">
                          {shot.thumbnail ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={`/api/production/thumbnails/${shot.thumbnail}`}
                              alt={shot.combined_code}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : "—"}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[11px] font-medium text-text-primary">{shot.combined_code}</span>
                          <span className="text-[10px] text-text-muted ml-3">{shot.frame_start}–{shot.frame_end}</span>
                          {shot.notes && <p className="text-[10px] text-text-muted truncate">{shot.notes}</p>}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <label className={cn(getIconButtonClass("neutral", "sm"), "cursor-pointer")}>
                                  <Upload className="h-3 w-3" />
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    className="hidden"
                                    onChange={(e) => { setUploadShotId(shot.id); handleThumbnailUpload(e); }}
                                  />
                                </label>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Upload thumbnail</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <button onClick={() => openEditShot(shot)} className={iconButton.edit}>
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => setDeleteShotId(shot.id)} className={iconButton.delete}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GroupedSection>
          );
        })
      )}

      {/* ─── Dialogs ──────────────────────────────────── */}

      {/* Create Act */}
      <Dialog open={createActOpen} onOpenChange={setCreateActOpen}>
        <DialogContent className="sm:max-w-sm bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Create Act</DialogTitle>
            <DialogDescription className="text-xs text-text-muted">
              Act code must follow the format act## (e.g. act01)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Code *</Label>
              <Input value={actCode} onChange={e => setActCode(e.target.value)} placeholder="act01" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Name *</Label>
              <Input value={actName} onChange={e => setActName(e.target.value)} placeholder="The Awakening" className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateActOpen(false)} className="text-xs">Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" disabled={!actCode || !actName || actSaving} onClick={handleCreateAct}>
              {actSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Act */}
      <Dialog open={editActOpen} onOpenChange={setEditActOpen}>
        <DialogContent className="sm:max-w-sm bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Edit Act</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Code</Label>
              <Input value={actCode} onChange={e => setActCode(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Name</Label>
              <Input value={actName} onChange={e => setActName(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditActOpen(false)} className="text-xs">Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" disabled={!actCode || !actName || actSaving} onClick={handleUpdateAct}>
              {actSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Act Confirmation */}
      <Dialog open={deleteActId !== null} onOpenChange={(open) => { if (!open) setDeleteActId(null); }}>
        <DialogContent className="sm:max-w-sm bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Act?</DialogTitle>
            <DialogDescription className="text-xs text-text-muted">
              {deleteActShotCount > 0
                ? `This act contains ${deleteActShotCount} shot(s). Deleting it will remove all shots and their status history. This cannot be undone.`
                : "This act is empty and will be deleted. This cannot be undone."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteActId(null)} className="text-xs">Cancel</Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1.5" disabled={deleting} onClick={handleDeleteAct}>
              {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Shot */}
      <Dialog open={createShotOpen} onOpenChange={setCreateShotOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Create Shot</DialogTitle>
            <DialogDescription className="text-xs text-text-muted">
              Shot code must follow the format shot## (e.g. shot01)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Code *</Label>
                <Input value={shotCode} onChange={e => setShotCode(e.target.value)} placeholder="shot01" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Act *</Label>
                <Select value={shotActId} onValueChange={setShotActId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {acts.map(a => (
                      <SelectItem key={a.id} value={a.id.toString()} className="text-xs">{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Frame Start</Label>
                <Input type="number" value={shotFrameStart} onChange={e => setShotFrameStart(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Frame End</Label>
                <Input type="number" value={shotFrameEnd} onChange={e => setShotFrameEnd(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Notes</Label>
              <Textarea value={shotNotes} onChange={e => setShotNotes(e.target.value)} placeholder="Description..." className="text-xs min-h-15" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateShotOpen(false)} className="text-xs">Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" disabled={!shotCode || !shotActId || shotSaving} onClick={handleCreateShot}>
              {shotSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Shot */}
      <Dialog open={editShotOpen} onOpenChange={setEditShotOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Edit Shot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Code</Label>
                <Input value={shotCode} onChange={e => setShotCode(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Act</Label>
                <Select value={shotActId} onValueChange={setShotActId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {acts.map(a => (
                      <SelectItem key={a.id} value={a.id.toString()} className="text-xs">{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Frame Start</Label>
                <Input type="number" value={shotFrameStart} onChange={e => setShotFrameStart(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Frame End</Label>
                <Input type="number" value={shotFrameEnd} onChange={e => setShotFrameEnd(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Notes</Label>
              <Textarea value={shotNotes} onChange={e => setShotNotes(e.target.value)} className="text-xs min-h-15" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditShotOpen(false)} className="text-xs">Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" disabled={!shotCode || !shotActId || shotSaving} onClick={handleUpdateShot}>
              {shotSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Shot Confirmation */}
      <Dialog open={deleteShotId !== null} onOpenChange={(open) => { if (!open) setDeleteShotId(null); }}>
        <DialogContent className="sm:max-w-sm bg-white dark:bg-linear-to-br dark:from-zinc-900 dark:to-black border-neutral-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Shot?</DialogTitle>
            <DialogDescription className="text-xs text-text-muted">
              This will permanently delete the shot and all its status history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteShotId(null)} className="text-xs">Cancel</Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1.5" disabled={deleting} onClick={handleDeleteShot}>
              {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden upload input for thumbnail */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            <span className="text-sm text-text-primary">Uploading thumbnail...</span>
          </div>
        </div>
      )}
    </div>
  );
}
