"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  AlertCircle,
  Film,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Check,
  X,
  FolderSync,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { GroupedSection } from "@/components/grouped-section";
import { accentColors } from "@/lib/accent-colors";

// ─── Types ─────────────────────────────────────────────

type Department = "lookdev" | "blocking" | "spline" | "polish" | "lighting" | "rendering" | "comp";
type Status = "not-started" | "in-progress" | "review" | "approved" | "omit";
type Priority = "low" | "medium" | "high" | "critical";

interface ShotStatus {
  id: number;
  shot_id: number;
  department: Department;
  status: Status;
  assignee: string | null;
  updated_at: string;
}

interface Shot {
  id: number;
  act_id: number;
  code: string;
  frame_start: number;
  frame_end: number;
  thumbnail: string | null;
  priority: Priority;
  notes: string | null;
  created_at: string;
  updated_at: string;
  act_code: string;
  act_name: string;
  combined_code: string;
  departments: ShotStatus[];
}

interface Act {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

// ─── Constants ─────────────────────────────────────────

const DEPARTMENTS: Department[] = ["lookdev", "blocking", "spline", "polish", "lighting", "rendering", "comp"];
const STATUSES: Status[] = ["not-started", "in-progress", "review", "approved", "omit"];

const DEPT_LABELS: Record<Department, string> = {
  lookdev: "LkDv",
  blocking: "Block",
  spline: "Spln",
  polish: "Pol",
  lighting: "Light",
  rendering: "Rndr",
  comp: "Comp",
};

const DEPT_FULL_LABELS: Record<Department, string> = {
  lookdev: "Look Dev",
  blocking: "Blocking",
  spline: "Spline",
  polish: "Polish",
  lighting: "Lighting",
  rendering: "Rendering",
  comp: "Comp",
};

const STATUS_LABELS: Record<Status, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  "review": "In Review",
  "approved": "Approved",
  "omit": "Omit",
};

// ─── Color Maps ────────────────────────────────────────

const statusColors: Record<Status, string> = {
  "not-started": "bg-neutral-300 dark:bg-white/10",
  "in-progress": "bg-amber-400 dark:bg-amber-500",
  "review": "bg-blue-400 dark:bg-blue-500",
  "approved": "bg-emerald-400 dark:bg-emerald-500",
  "omit": "bg-neutral-300 dark:bg-white/15",
};

const statusDotColors: Record<Status, string> = {
  "not-started": "bg-neutral-400 dark:bg-white/20",
  "in-progress": "bg-amber-500 dark:bg-amber-400",
  "review": "bg-blue-500 dark:bg-blue-400",
  "approved": "bg-emerald-500 dark:bg-emerald-400",
  "omit": "bg-neutral-400 dark:bg-white/30",
};


const actAccents = [accentColors.blue, accentColors.amber, accentColors.emerald];

type ViewMode = "table" | "grid" | "colorscript";

// ─── Helper ────────────────────────────────────────────

function getShotCompletion(shot: Shot): number {
  if (shot.departments.length === 0) return 0;
  const done = shot.departments.filter(d => d.status === "approved").length;
  return Math.round((done / shot.departments.length) * 100);
}

function getActCompletion(shots: Shot[]): number {
  if (shots.length === 0) return 0;
  const total = shots.length * DEPARTMENTS.length;
  let completed = 0;
  for (const shot of shots) {
    completed += shot.departments.filter(d => d.status === "approved").length;
  }
  return Math.round((completed / total) * 100);
}

// ─── Component: Shot Thumbnail ────────────────────────

function ShotThumbnail({ shot, className, onClick }: {
  shot: Shot;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "aspect-video bg-surface-muted flex items-center justify-center overflow-hidden",
        shot.thumbnail && "cursor-pointer",
        className
      )}
      onClick={shot.thumbnail ? onClick : undefined}
    >
      {shot.thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/production/thumbnails/${shot.thumbnail}`}
          alt={shot.combined_code}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex flex-col items-center text-text-muted">
          <ImageIcon className="h-6 w-6 opacity-30" />
          <span className="text-[10px] font-mono mt-1">{shot.combined_code}</span>
        </div>
      )}
    </div>
  );
}

// ─── Component: Inline Edit ───────────────────────────

function InlineEdit({ value, onSave, className, type = "text", prefix }: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  type?: "text" | "number";
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className={cn("cursor-pointer hover:bg-neutral-100 dark:hover:bg-white/5 rounded px-1 -mx-1 transition-colors", className)}
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
      >
        {prefix}{value}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0">
      {prefix && <span className={cn("text-text-muted select-none", className)}>{prefix}</span>}
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { setEditing(false); }
        }}
        className={cn(
          "bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/15 rounded px-1 outline-none focus:ring-1 focus:ring-blue-500/50",
          type === "number" && "w-16",
          className
        )}
      />
    </span>
  );
}

// ─── Component: Pipeline Bar ──────────────────────────

function PipelineBar({ shot, canEdit, onStatusChange }: {
  shot: Shot;
  canEdit: boolean;
  onStatusChange: (dept: Department, status: Status) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex">
        {DEPARTMENTS.map(dept => (
          <span key={dept} className="flex-1 text-center text-[7px] font-semibold uppercase tracking-wide text-text-muted leading-none select-none">
            {DEPT_LABELS[dept]}
          </span>
        ))}
      </div>
      <div className="flex h-4 rounded-md overflow-hidden border border-neutral-200 dark:border-white/10">
      {DEPARTMENTS.map(dept => {
        const deptData = shot.departments.find(d => d.department === dept);
        const status = deptData?.status ?? "not-started";

        const segment = (
          <div
            key={dept}
            className={cn(
              "flex-1 relative transition-colors",
              statusColors[status],
              canEdit && "cursor-pointer hover:brightness-110"
            )}
          />
        );

        if (!canEdit) {
          return (
            <TooltipProvider key={dept} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>{segment}</TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{DEPT_FULL_LABELS[dept]}</p>
                  <p>{STATUS_LABELS[status]}</p>
                  {deptData?.assignee && <p className="text-white/60">{deptData.assignee}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return (
          <TooltipProvider key={dept} delayDuration={100}>
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>{segment}</DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{DEPT_FULL_LABELS[dept]}</p>
                  <p>{STATUS_LABELS[status]}</p>
                  {deptData?.assignee && <p className="text-white/60">{deptData.assignee}</p>}
                </TooltipContent>
                <DropdownMenuContent align="center" className="min-w-36">
                  <p className="px-2 py-1 text-[10px] font-medium text-text-muted uppercase tracking-wider">{DEPT_FULL_LABELS[dept]}</p>
                  {STATUSES.map(s => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => onStatusChange(dept, s)}
                      className={cn("text-xs gap-2", status === s && "font-semibold")}
                    >
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusDotColors[s])} />
                      {STATUS_LABELS[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
    </div>
  );
}

function DepartmentLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted">
      {STATUSES.map(s => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn("w-2.5 h-2.5 rounded-full", statusDotColors[s])} />
          <span>{STATUS_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────

export default function ProductionPage() {
  // State
  const [acts, setActs] = useState<Act[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canManage, setCanManage] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [csColumns, setCsColumns] = useState(3);
  const [lightboxShot, setLightboxShot] = useState<Shot | null>(null);

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

      if (!actsRes.ok || !shotsRes.ok) throw new Error("Failed to fetch data");

      const [actsData, shotsData] = await Promise.all([actsRes.json(), shotsRes.json()]);

      setActs(actsData.acts || []);
      setShots(shotsData.shots || []);

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        const role = session.user?.role;
        // All authenticated users can edit statuses
        setCanEdit(!!role);
        // All roles can manage acts/shots (add, edit, delete)
        setCanManage(role === "admin" || role === "manager" || role === "student");
      }
    } catch {
      setError("Failed to load production data");
      toast.error("Failed to load production data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Mutations ──────────────────────────────────────

  const handleStatusChange = useCallback(async (shotId: number, department: Department, newStatus: Status) => {
    try {
      const res = await fetch(`/api/production/shots/${shotId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }

      // Optimistic update
      setShots(prev => prev.map(s => {
        if (s.id !== shotId) return s;
        return {
          ...s,
          departments: s.departments.map(d =>
            d.department === department ? { ...d, status: newStatus, updated_at: new Date().toISOString() } : d
          ),
        };
      }));

      toast.success(`${DEPT_FULL_LABELS[department]} → ${STATUS_LABELS[newStatus]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }, []);

  const handleUpdateShot = useCallback(async (shotId: number, updates: Record<string, string | number>) => {
    try {
      const res = await fetch(`/api/production/shots/${shotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update shot");
      }
      // Optimistic update
      setShots(prev => prev.map(s => {
        if (s.id !== shotId) return s;
        const updated = { ...s, ...updates };
        if (updates.code) {
          updated.combined_code = `${s.act_code}_${updates.code}`;
        }
        return updated as Shot;
      }));
      toast.success("Updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
      fetchData();
    }
  }, [fetchData]);

  // ─── Sync from Thumbnail Folder ─────────────────────

  const [syncing, setSyncing] = useState(false);

  const handleSyncThumbnails = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/production/sync-thumbnails", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const parts: string[] = [];
      if (data.created.acts > 0) parts.push(`${data.created.acts} act(s) created`);
      if (data.created.shots > 0) parts.push(`${data.created.shots} shot(s) created`);
      if (data.removed?.acts > 0) parts.push(`${data.removed.acts} act(s) removed`);
      if (data.removed?.shots > 0) parts.push(`${data.removed.shots} shot(s) removed`);
      if (data.updated.thumbnails > 0) parts.push(`${data.updated.thumbnails} thumbnail(s) updated`);
      toast.success(parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Already up to date");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  // ─── Act Management ─────────────────────────────────

  const handleCreateAct = useCallback(async (code: string, name: string) => {
    try {
      const res = await fetch("/api/production/acts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create act");
      }
      toast.success(`Created ${code}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create act");
    }
  }, [fetchData]);

  const handleDeleteAct = useCallback(async (actId: number) => {
    const act = acts.find(a => a.id === actId);
    if (!act) return;
    if (!confirm(`Delete ${act.code}? This will also delete all its shots.`)) return;
    try {
      const res = await fetch(`/api/production/acts/${actId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete act");
      }
      toast.success(`Deleted ${act.code}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete act");
    }
  }, [acts, fetchData]);

  // ─── Shot Management ────────────────────────────────

  const handleCreateShot = useCallback(async (actId: number, code: string) => {
    try {
      const res = await fetch("/api/production/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ act_id: actId, code }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create shot");
      }
      toast.success(`Created ${code}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create shot");
    }
  }, [fetchData]);

  const handleDeleteShot = useCallback(async (shotId: number) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    if (!confirm(`Delete ${shot.combined_code}?`)) return;
    try {
      const res = await fetch(`/api/production/shots/${shotId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete shot");
      }
      toast.success(`Deleted ${shot.combined_code}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete shot");
    }
  }, [shots, fetchData]);

  // ─── Filtering & Sorting ────────────────────────────

  const filteredShots = useMemo(() => {
    let result = [...shots];

    // Search by combined code
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.combined_code.toLowerCase().includes(q));
    }

    // Sort by code
    result.sort((a, b) => a.combined_code.localeCompare(b.combined_code));

    return result;
  }, [shots, searchQuery]);

  // Group shots by act
  const shotsByAct = useMemo(() => {
    const map = new Map<string, Shot[]>();
    for (const shot of filteredShots) {
      const key = shot.act_code;
      const arr = map.get(key) || [];
      arr.push(shot);
      map.set(key, arr);
    }
    return map;
  }, [filteredShots]);



  // ─── Loading State ──────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-surface-muted animate-pulse" />
          <div className="h-6 w-48 rounded bg-surface-muted animate-pulse" />
        </div>
        <div className="h-10 rounded-lg bg-surface-muted animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <AlertCircle className="h-12 w-12 text-danger mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">Failed to load production data</h2>
        <p className="text-sm text-text-muted mb-6">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm">Try Again</Button>
      </div>
    );
  }

  if (acts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <Film className="h-16 w-16 text-text-muted mb-6" />
        <h2 className="text-xl font-medium text-text-primary mb-2">No Production Data</h2>
        <p className="text-sm text-text-muted mb-8 text-center max-w-md">
          Add your first act to start tracking, or run the seed script.
        </p>
        <div className="flex gap-3 items-center">
          {canManage && (
            <Button onClick={handleSyncThumbnails} disabled={syncing} variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderSync className="h-3 w-3" />}
              Sync from Thumbnails
            </Button>
          )}
          {canManage && <AddActButton onCreate={handleCreateAct} acts={acts} />}
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Film className="h-6 w-6 text-text-muted" />
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Nightlight Guardians</h1>
            <p className="text-xs text-text-muted">Production Tracking — {shots.length} shots across {acts.length} acts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button onClick={handleSyncThumbnails} disabled={syncing} variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderSync className="h-3 w-3" />}
              Sync Thumbnails
            </Button>
          )}
          {canManage && <AddActButton onCreate={handleCreateAct} acts={acts} />}
          <Button onClick={fetchData} variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-text-muted">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {(() => {
        const totalDepts = shots.length * DEPARTMENTS.length;
        const approved = shots.reduce((n, s) => n + s.departments.filter(d => d.status === "approved").length, 0);
        const pct = totalDepts > 0 ? Math.round((approved / totalDepts) * 100) : 0;
        const shotsComplete = shots.filter(s => s.departments.every(d => d.status === "approved")).length;

        // Per-department status breakdown
        const deptBreakdown = DEPARTMENTS.map(dept => {
          const counts: Record<Status, number> = { "not-started": 0, "in-progress": 0, "review": 0, "approved": 0, "omit": 0 };
          for (const shot of shots) {
            const status = shot.departments.find(d => d.department === dept)?.status ?? "not-started";
            counts[status]++;
          }
          return { dept, counts, total: shots.length };
        });

        return (
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-5">
            <div className="flex gap-6 items-center">
              {/* Completion gauge — rounded rectangle */}
              {(() => {
                const w = 180, h = 180;
                const sw = 10;
                const pad = sw / 2 + 2;
                const rx = 14;
                // Rounded rect perimeter approximation
                const iw = w - pad * 2, ih = h - pad * 2;
                const ir = Math.min(rx, iw / 2, ih / 2);
                const perim = 2 * (iw + ih) - 8 * ir + 2 * Math.PI * ir;
                const dash = (pct / 100) * perim;

                // Inner ring
                const pad2 = pad + 16;
                const iw2 = w - pad2 * 2, ih2 = h - pad2 * 2;
                const ir2 = Math.min(rx - 8, iw2 / 2, ih2 / 2);
                const perim2 = 2 * (iw2 + ih2) - 8 * ir2 + 2 * Math.PI * ir2;
                const shotPct = shots.length > 0 ? shotsComplete / shots.length : 0;
                const dash2 = shotPct * perim2;
                const sw2 = 6;

                return (
                  <div className="relative shrink-0" style={{ width: w, height: h }}>
                    <svg width={w} height={h}>
                      <defs>
                        <filter id="gauge-glow">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="gauge-glow-inner">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="gauge-pulse-glow">
                          <feGaussianBlur stdDeviation="6" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      {/* Outer track */}
                      <rect x={pad} y={pad} width={iw} height={ih} rx={ir} fill="none" strokeWidth={sw} className="stroke-neutral-200/50 dark:stroke-white/5" />
                      {/* Outer progress */}
                      <rect x={pad} y={pad} width={iw} height={ih} rx={ir} fill="none"
                        strokeWidth={sw} strokeLinecap="round"
                        className="stroke-emerald-500 dark:stroke-emerald-400"
                        filter="url(#gauge-glow)"
                        strokeDasharray={`${dash} ${perim - dash}`}
                        pathLength={perim}
                        style={{
                          strokeDashoffset: perim,
                          animation: `gauge-draw 1.2s cubic-bezier(0.4,0,0.2,1) 0.3s forwards`,
                        }}
                      />
                      {/* Outer glow pulse overlay */}
                      <rect x={pad} y={pad} width={iw} height={ih} rx={ir} fill="none"
                        strokeWidth={sw + 2} strokeLinecap="round"
                        className="stroke-emerald-400/10 dark:stroke-emerald-300/8"
                        filter="url(#gauge-pulse-glow)"
                        strokeDasharray={`${dash} ${perim - dash}`}
                        pathLength={perim}
                        style={{
                          strokeDashoffset: perim,
                          animation: `gauge-draw 1.2s cubic-bezier(0.4,0,0.2,1) 0.3s forwards, gauge-breathe 4s ease-in-out 2s infinite`,
                        }}
                      />
                      {/* Inner track */}
                      <rect x={pad2} y={pad2} width={iw2} height={ih2} rx={ir2} fill="none" strokeWidth={sw2} className="stroke-neutral-200/30 dark:stroke-white/4" />
                      {/* Inner progress — shots */}
                      <rect x={pad2} y={pad2} width={iw2} height={ih2} rx={ir2} fill="none"
                        strokeWidth={sw2} strokeLinecap="round"
                        className="stroke-emerald-500/50 dark:stroke-emerald-400/40"
                        filter="url(#gauge-glow-inner)"
                        strokeDasharray={`${dash2} ${perim2 - dash2}`}
                        pathLength={perim2}
                        style={{
                          strokeDashoffset: perim2,
                          animation: `gauge-draw 1s cubic-bezier(0.4,0,0.2,1) 0.6s forwards`,
                        }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity: 0, animation: 'fade-in 0.5s ease 0.8s forwards' }}>
                      <span className="text-3xl font-black text-text-primary leading-none tracking-tight">{pct}%</span>
                      <span className="text-[10px] font-medium text-text-muted mt-1 uppercase tracking-widest">approved</span>
                      <span className="text-[9px] text-text-muted mt-0.5">{shotsComplete}/{shots.length} shots</span>
                    </div>
                  </div>
                );
              })()}

              <div className="h-40 w-px bg-border-muted shrink-0" />

              {/* Sankey flow: departments → statuses */}
              <div className="flex-1 min-w-0">
                {(() => {
                  const W = 900, H = 180;
                  const nodeW = 14;
                  const leftX = 44, rightX = W - 70;
                  const gap = 4;
                  const activeStatuses: Status[] = ["not-started", "in-progress", "review", "approved"];

                  // Left nodes: departments (equal height)
                  const totalLeft = DEPARTMENTS.length;
                  const availH = H - (totalLeft - 1) * gap;
                  const leftNodeH = availH / totalLeft;
                  const leftNodes = DEPARTMENTS.map((dept, i) => ({
                    dept,
                    x: leftX,
                    y: i * (leftNodeH + gap),
                    h: leftNodeH,
                  }));

                  // Right nodes: statuses (height proportional to count)
                  const statusTotals = activeStatuses.map(s => {
                    const count = deptBreakdown.reduce((n, d) => n + d.counts[s], 0);
                    return { status: s, count };
                  }).filter(s => s.count > 0);
                  const totalRight = statusTotals.reduce((n, s) => n + s.count, 0);
                  const rightAvailH = H - (statusTotals.length - 1) * gap;
                  let rightY = 0;
                  const rightNodes = statusTotals.map(({ status, count }) => {
                    const h = (count / totalRight) * rightAvailH;
                    const node = { status, x: rightX, y: rightY, h, count };
                    rightY += h + gap;
                    return node;
                  });

                  // Build flows
                  type Flow = { dept: Department; status: Status; count: number };
                  const flows: Flow[] = [];
                  for (const { dept, counts } of deptBreakdown) {
                    for (const s of activeStatuses) {
                      if (counts[s] > 0) flows.push({ dept, status: s, count: counts[s] });
                    }
                  }

                  // Track offsets for stacking at source/target
                  const leftOffsets: Record<string, number> = {};
                  DEPARTMENTS.forEach(d => leftOffsets[d] = 0);
                  const rightOffsets: Record<string, number> = {};
                  activeStatuses.forEach(s => rightOffsets[s] = 0);

                  const deptTotal = shots.length; // each dept has this many shots

                  const flowFills: Record<Status, string> = {
                    "not-started": "rgba(163,163,163,0.18)",
                    "in-progress": "rgba(251,191,36,0.25)",
                    "review": "rgba(96,165,250,0.3)",
                    "approved": "rgba(52,211,153,0.3)",
                    "omit": "rgba(163,163,163,0.12)",
                  };

                  const nodeFills: Record<Status, string> = {
                    "not-started": "#a3a3a3",
                    "in-progress": "#f59e0b",
                    "review": "#60a5fa",
                    "approved": "#34d399",
                    "omit": "#a3a3a3",
                  };

                  const flowPaths = flows.map((flow) => {
                    const ln = leftNodes.find(n => n.dept === flow.dept)!;
                    const rn = rightNodes.find(n => n.status === flow.status)!;

                    const flowH_left = (flow.count / deptTotal) * ln.h;
                    const flowH_right = (flow.count / rn.count) * rn.h;

                    const y0 = ln.y + leftOffsets[flow.dept];
                    const y1 = rn.y + rightOffsets[flow.status];

                    leftOffsets[flow.dept] += flowH_left;
                    rightOffsets[flow.status] += flowH_right;

                    const x0 = leftX + nodeW;
                    const x1 = rightX;
                    const mx = (x0 + x1) / 2;

                    const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + flowH_right} C${mx},${y1 + flowH_right} ${mx},${y0 + flowH_left} ${x0},${y0 + flowH_left} Z`;

                    return { key: `${flow.dept}-${flow.status}`, d, fill: flowFills[flow.status], dept: flow.dept, status: flow.status, count: flow.count };
                  });

                  const flowGlows: Record<Status, string> = {
                    "not-started": "rgba(163,163,163,0.08)",
                    "in-progress": "rgba(251,191,36,0.15)",
                    "review": "rgba(96,165,250,0.18)",
                    "approved": "rgba(52,211,153,0.18)",
                    "omit": "rgba(163,163,163,0.05)",
                  };

                  return (
                    <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="xMidYMid meet" className="w-full overflow-visible" style={{ maxHeight: 200 }}>
                      <defs>
                        <filter id="sankey-flow-glow">
                          <feGaussianBlur stdDeviation="6" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="sankey-node-glow">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        {/* Gradient fills for flows */}
                        {flowPaths.map(fp => (
                          <linearGradient key={`grad-${fp.key}`} id={`grad-${fp.key}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={flowGlows[fp.status]} />
                            <stop offset="50%" stopColor={fp.fill} />
                            <stop offset="100%" stopColor={fp.fill} />
                          </linearGradient>
                        ))}
                      </defs>
                      {/* Flow glow layer */}
                      {flowPaths.map((fp, i) => (
                        <path key={`glow-${fp.key}`} d={fp.d} fill={fp.fill} filter="url(#sankey-flow-glow)"
                          style={{ opacity: 0, animation: `sankey-flow-in 0.8s ease ${0.4 + i * 0.05}s forwards` }}
                        />
                      ))}
                      {/* Flows */}
                      {flowPaths.map((fp, i) => (
                        <path key={fp.key} d={fp.d} fill={`url(#grad-${fp.key})`}
                          className="hover:opacity-80"
                          style={{ opacity: 0, animation: `sankey-flow-in 0.8s ease ${0.4 + i * 0.05}s forwards` }}
                        />
                      ))}
                      {/* Left nodes (departments) */}
                      {leftNodes.map((n, i) => (
                        <g key={n.dept} style={{ opacity: 0, animation: `fade-in 0.6s ease ${0.2 + i * 0.06}s forwards` }}>
                          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} className="fill-neutral-400 dark:fill-white/30" filter="url(#sankey-node-glow)" />
                          <text x={n.x - 4} y={n.y + n.h / 2} textAnchor="end" dominantBaseline="central" className="fill-text-muted text-[9px] font-semibold uppercase">
                            {DEPT_LABELS[n.dept]}
                          </text>
                        </g>
                      ))}
                      {/* Right nodes (statuses) */}
                      {rightNodes.map((n, i) => (
                        <g key={n.status} style={{ opacity: 0, animation: `fade-in 0.5s ease ${1.2 + i * 0.1}s forwards` }}>
                          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} fill={nodeFills[n.status]} filter="url(#sankey-node-glow)"
                            style={{ animation: `sankey-node-pulse 5s ease-in-out ${i * 0.8}s infinite` }}
                          />
                          <text x={n.x + nodeW + 6} y={n.y + n.h / 2} textAnchor="start" dominantBaseline="central" className="text-[12px] font-semibold uppercase">
                            <tspan className="fill-text-muted">{STATUS_LABELS[n.status]}</tspan>
                            <tspan className="fill-text-primary font-bold" dx={5}>{n.count}</tspan>
                            <tspan className="fill-text-muted text-[10px]">/{totalRight}</tspan>
                          </text>
                        </g>
                      ))}
                    </svg>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <DepartmentLegend />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder="Search act##_shot##..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8"
          />
        </div>

        <div className="flex-1" />

        {/* View tabs */}
        <div className="flex border border-border rounded-lg overflow-hidden text-xs">
          {(["table", "grid", "colorscript"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1.5 transition-colors capitalize",
                viewMode === mode
                  ? "bg-neutral-200 dark:bg-white/15 text-text-primary font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-muted"
              )}
            >
              {mode === "colorscript" ? "Color Script" : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Column control for Color Script */}
        {viewMode === "colorscript" && (
          <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
            <button onClick={() => setCsColumns(c => Math.max(1, c - 1))} className="px-2 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors">−</button>
            <span className="text-[10px] text-text-muted w-4 text-center">{csColumns}</span>
            <button onClick={() => setCsColumns(c => Math.min(8, c + 1))} className="px-2 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors">+</button>
          </div>
        )}
      </div>

      {/* Shot Display */}
      {filteredShots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Film className="h-10 w-10 text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No shots match your filters</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => setSearchQuery("")}
          >
            Clear Search
          </Button>
        </div>
      ) : viewMode === "colorscript" ? (
        /* Color Script – acts as columns, shots in configurable grid */
        <div className="flex gap-4 overflow-x-auto pb-2">
          {acts.map((act) => {
            const actShots = shotsByAct.get(act.code) || [];
            if (actShots.length === 0) return null;
            return (
              <div key={act.id} className="shrink-0 flex-1 min-w-0">
                <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider text-center mb-1">{act.code}</h3>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${csColumns}, 1fr)` }}>
                  {actShots.map(shot => (
                    <div
                      key={shot.id}
                      className={cn("relative aspect-video rounded-sm overflow-hidden bg-neutral-100 dark:bg-white/5", shot.thumbnail && "cursor-pointer")}
                      onClick={shot.thumbnail ? () => setLightboxShot(shot) : undefined}
                    >
                      {shot.thumbnail ? (
                        <img
                          src={`/api/production/thumbnails/${shot.thumbnail}`}
                          alt={shot.combined_code}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-text-muted opacity-30" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-1 py-0.5">
                        <span className="text-[7px] font-medium text-white/90">{shot.combined_code}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table / Grid – grouped by act */
        <div className="space-y-4">
          {acts.map((act, actIdx) => {
            const actShots = shotsByAct.get(act.code) || [];
            const pct = getActCompletion(actShots);
            return (
              <GroupedSection
                key={act.id}
                title={act.code}
                badge={`${actShots.length} shots`}
                stats={`${pct}% complete`}
                accentColors={actAccents[actIdx % actAccents.length]}
                defaultOpen={true}
                rightContent={
                  <div className="flex items-center gap-2">
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleDeleteAct(act.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Delete Act</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                    <div className="w-24">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </div>
                }
              >
                <div className="p-2">
                  {actShots.length > 0 ? (
                    viewMode === "table" ? (
                      <ShotTableView shots={actShots} canEdit={canEdit} canManage={canManage} onStatusChange={handleStatusChange} onUpdateShot={handleUpdateShot} onDeleteShot={handleDeleteShot} onViewShot={setLightboxShot} />
                    ) : (
                      <ShotGridView shots={actShots} canEdit={canEdit} canManage={canManage} onStatusChange={handleStatusChange} onUpdateShot={handleUpdateShot} onDeleteShot={handleDeleteShot} onViewShot={setLightboxShot} />
                    )
                  ) : (
                    <div className="flex flex-col items-center py-8 text-text-muted">
                      <Film className="h-8 w-8 opacity-30 mb-2" />
                      <p className="text-xs">No shots in this act yet</p>
                    </div>
                  )}
                  {canManage && <AddShotButton actId={act.id} actCode={act.code} shots={actShots} onCreate={handleCreateShot} />}
                </div>
              </GroupedSection>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <p className="text-[10px] text-text-muted text-center">
        Showing {filteredShots.length} of {shots.length} shots
      </p>

      {/* Lightbox */}
      {lightboxShot && lightboxShot.thumbnail && (() => {
        const idx = filteredShots.findIndex(s => s.id === lightboxShot.id);
        const prev = idx > 0 ? filteredShots[idx - 1] : null;
        const next = idx < filteredShots.length - 1 ? filteredShots[idx + 1] : null;
        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setLightboxShot(null)}>
            <div className="relative max-w-5xl max-h-[90vh] w-full mx-4" onClick={e => e.stopPropagation()}>
              {/* Close */}
              <button className="absolute -top-8 right-0 text-white/70 hover:text-white text-sm" onClick={() => setLightboxShot(null)}>Close</button>
              {/* Image */}
              <img
                src={`/api/production/thumbnails/${lightboxShot.thumbnail}`}
                alt={lightboxShot.combined_code}
                className="w-full h-auto max-h-[85vh] object-contain rounded"
              />
              {/* Label */}
              <p className="text-center text-white/80 text-xs mt-2 font-mono">{lightboxShot.combined_code}</p>
              {/* Prev */}
              {prev && prev.thumbnail && (
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                  onClick={() => setLightboxShot(prev)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {/* Next */}
              {next && next.thumbnail && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                  onClick={() => setLightboxShot(next)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Component: Shot Table View ───────────────────────

function ShotTableView({ shots, canEdit, canManage, onStatusChange, onUpdateShot, onDeleteShot, onViewShot }: {
  shots: Shot[];
  canEdit: boolean;
  canManage: boolean;
  onStatusChange: (shotId: number, dept: Department, status: Status) => void;
  onUpdateShot: (shotId: number, updates: Record<string, string | number>) => void;
  onDeleteShot?: (shotId: number) => void;
  onViewShot?: (shot: Shot) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl overflow-hidden">
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '344px' }} />
          <col style={{ width: '120px' }} />
          <col style={{ width: '80px' }} />
          <col />
          <col style={{ width: '144px' }} />
          {canManage && <col style={{ width: '40px' }} />}
        </colgroup>
        <thead>
          <tr className="bg-neutral-50/50 dark:bg-white/2 border-b border-neutral-200/60 dark:border-white/5">
            <th className="text-left py-2.5 px-3 font-medium text-text-muted">Preview</th>
            <th className="text-left py-2.5 px-3 font-medium text-text-muted">Shot</th>
            <th className="text-left py-2.5 px-3 font-medium text-text-muted">Frames</th>
            <th className="text-left py-2.5 px-3 font-medium text-text-muted">Pipeline</th>
            <th className="text-right py-2.5 px-3 font-medium text-text-muted">Done</th>
            {canManage && <th />}
          </tr>
        </thead>
        <tbody>
          {shots.map((shot, idx) => {
            const completion = getShotCompletion(shot);
            return (
              <tr
                key={shot.id}
                className={cn(
                  "border-b border-neutral-100 dark:border-white/4 last:border-0",
                  idx % 2 === 0 && "bg-white/30 dark:bg-transparent"
                )}
              >
                <td className="py-2 px-3 align-middle">
                  <ShotThumbnail shot={shot} onClick={() => onViewShot?.(shot)} className="w-80 shrink-0 rounded-sm border border-border-muted" />
                </td>
                <td className="py-2 px-3 align-middle">
                  {canManage ? (
                    <InlineEdit
                      value={shot.code}
                      prefix={`${shot.act_code}_`}
                      onSave={(code) => onUpdateShot(shot.id, { code })}
                      className="font-mono font-medium text-text-primary text-[11px]"
                    />
                  ) : (
                    <span className="font-mono font-medium text-text-primary text-[11px]">{shot.combined_code}</span>
                  )}

                </td>
                <td className="py-2 px-3 align-middle">
                  {canManage ? (
                    <div className="inline-flex items-center gap-0.5">
                      <InlineEdit
                        value={shot.frame_start.toString()}
                        onSave={(v) => onUpdateShot(shot.id, { frame_start: Number(v) })}
                        type="number"
                        className="font-mono text-[10px] text-text-muted"
                      />
                      <span className="text-text-muted text-[10px]">&ndash;</span>
                      <InlineEdit
                        value={shot.frame_end.toString()}
                        onSave={(v) => onUpdateShot(shot.id, { frame_end: Number(v) })}
                        type="number"
                        className="font-mono text-[10px] text-text-muted"
                      />
                    </div>
                  ) : (
                    <span className="font-mono text-[10px] text-text-muted">{shot.frame_start}&ndash;{shot.frame_end}</span>
                  )}
                </td>
                <td className="py-2 px-3 align-middle">
                  <PipelineBar
                    shot={shot}
                    canEdit={canEdit}
                    onStatusChange={(dept, status) => onStatusChange(shot.id, dept, status)}
                  />
                </td>
                <td className="py-2 px-3 text-right align-middle">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-20 h-2 rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                        style={{ width: `${completion}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-text-muted w-8 text-right">{completion}%</span>
                  </div>
                </td>
                {canManage && onDeleteShot && (
                  <td className="py-2 px-1 align-middle text-center">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-red-500" onClick={() => onDeleteShot(shot.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component: Shot Grid View ────────────────────────

function ShotGridView({ shots, canEdit, canManage, onStatusChange, onUpdateShot, onDeleteShot, onViewShot }: {
  shots: Shot[];
  canEdit: boolean;
  canManage: boolean;
  onStatusChange: (shotId: number, dept: Department, status: Status) => void;
  onUpdateShot: (shotId: number, updates: Record<string, string | number>) => void;
  onDeleteShot?: (shotId: number) => void;
  onViewShot?: (shot: Shot) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {shots.map(shot => {
        const completion = getShotCompletion(shot);
        return (
          <div
            key={shot.id}
            className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl overflow-hidden transition-all hover:border-neutral-300 dark:hover:border-white/10 group/card relative"
          >
            {canManage && onDeleteShot && (
              <Button variant="ghost" size="icon"
                className="absolute top-1 right-1 z-10 h-5 w-5 bg-black/40 hover:bg-red-500/80 text-white opacity-0 group-hover/card:opacity-100 transition-opacity rounded-full"
                onClick={() => onDeleteShot(shot.id)}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </Button>
            )}
            {/* Thumbnail */}
            <ShotThumbnail shot={shot} onClick={() => onViewShot?.(shot)} />

            {/* Info */}
            <div className="p-2 space-y-1.5">
              {canManage ? (
                <InlineEdit
                  value={shot.code}
                  prefix={`${shot.act_code}_`}
                  onSave={(code) => onUpdateShot(shot.id, { code })}
                  className="text-[10px] font-mono font-medium text-text-primary"
                />
              ) : (
                <span className="text-[10px] font-mono font-medium text-text-primary">{shot.combined_code}</span>
              )}

              {/* Department statuses */}
              <PipelineBar
                shot={shot}
                canEdit={canEdit}
                onStatusChange={(dept, status) => onStatusChange(shot.id, dept, status)}
              />

              {/* Progress */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <span className="text-[9px] text-text-muted">{completion}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component: Add Act Button ────────────────────────

function AddActButton({ onCreate, acts }: {
  onCreate: (code: string, name: string) => void;
  acts: Act[];
}) {
  const nextCode = useMemo(() => {
    const nums = acts.map(a => parseInt(a.code.replace("act", ""), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `act${next.toString().padStart(2, "0")}`;
  }, [acts]);

  return (
    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onCreate(nextCode, nextCode)}>
      <Plus className="h-3 w-3" /> Add Act
    </Button>
  );
}

// ─── Component: Add Shot Button ───────────────────────

function AddShotButton({ actId, actCode, shots, onCreate }: {
  actId: number;
  actCode: string;
  shots: Shot[];
  onCreate: (actId: number, code: string) => void;
}) {
  const nextCode = useMemo(() => {
    const nums = shots
      .filter(s => s.act_id === actId)
      .map(s => parseInt(s.code.replace("shot", ""), 10))
      .filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `shot${next.toString().padStart(2, "0")}`;
  }, [shots, actId]);

  return (
    <div className="flex justify-center pt-2 pb-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5 text-text-muted hover:text-text-primary"
        onClick={() => onCreate(actId, nextCode)}
      >
        <Plus className="h-3 w-3" /> Add Shot ({actCode}_{nextCode})
      </Button>
    </div>
  );
}
