"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ResizableTable,
  ResizableTableBody,
  ResizableTableCell,
  ResizableTableHead,
  ResizableTableHeader,
  ResizableTableRow,
} from "@/components/ui/resizable-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Rocket, Search, CheckSquare, Square, Clock, ChevronDown, CheckCircle2, XCircle, Loader2, Upload, Circle, Tag, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GroupedSection } from "@/components/grouped-section";
import { accentColorList } from "@/lib/accent-colors";
import { getIconButtonClass } from "@/lib/icon-button-styles";

interface DeployHost {
  id: string;
  name: string;
  specificTag: string;
  room: string;
  state: string;
  lockState: string;
  tags: string[];
}

interface DeployJob {
  id: string;
  name: string;
  state: string;
  startTime: number;
  stopTime: number;
  succeededFrames: number;
  deadFrames: number;
  runningFrames: number;
  waitingFrames: number;
  totalFrames: number;
  isPaused: boolean;
}

const stateColors: Record<string, string> = {
  UP: "bg-success/15 dark:bg-success/10 text-success border-success/30",
  DOWN: "bg-danger/15 dark:bg-danger/10 text-danger border-danger/30",
  REPAIR: "bg-warning/15 dark:bg-warning/10 text-warning border-warning/30",
  UNKNOWN: "bg-surface-muted text-text-muted border-border",
};

const lockColors: Record<string, string> = {
  OPEN: "bg-success/15 dark:bg-success/10 text-success border-success/30",
  LOCKED: "bg-danger/15 dark:bg-danger/10 text-danger border-danger/30",
  NIMBY_LOCKED: "bg-warning/15 dark:bg-warning/10 text-warning border-warning/30",
};

function formatDate(unix: number): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Determine overall job status for display */
function jobDisplayState(job: DeployJob): string {
  if (job.isPaused) return "PAUSED";
  if (job.runningFrames > 0) return "RUNNING";
  if (job.deadFrames > 0 && job.succeededFrames === 0) return "DEAD";
  if (job.succeededFrames > 0 && job.deadFrames === 0 && job.runningFrames === 0) return "SUCCEEDED";
  if (job.deadFrames > 0) return "PARTIAL";
  if (job.waitingFrames > 0) return "PENDING";
  return job.state || "UNKNOWN";
}

/**
 * OpenCue rewrites job names to lowercase with underscores in a composite format:
 *   {show}-{shot_normalized}-{user}_{show}_{shot_normalized}_{yyyy}_{mm}_{dd}_{hh}_{mm}_{tag_normalized}
 * e.g. maintenance-rqd_update-sysadmin_maintenance_rqd_update_2026_04_21_21_12_ad404_11
 *
 * Extract the host tag (e.g. "AD404-11") — last two underscore-separated segments.
 */
function jobHostTag(name: string): string {
  const m = name.match(/(ad\d+)_(\d+)$/i);
  return m ? `${m[1]}-${m[2]}`.toUpperCase() : "";
}

/**
 * Extract the batch timestamp string (e.g. "2026_04_21_21_12") used to group
 * jobs submitted in the same minute (same deploy action).
 */
function jobBatchId(name: string): string {
  const m = name.match(/(\d{4}_\d{2}_\d{2}_\d{2}_\d{2})_ad\d+_\d+$/i);
  return m ? m[1] : name.slice(-20);
}

/** Format a batch ID for display (e.g. "2026_04_21_21_12" → "Apr 21, 9:12 PM") */
function formatBatchId(batchId: string): string {
  const parts = batchId.split("_");
  if (parts.length < 5) return batchId;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(parts[3]), Number(parts[4]));
  return (
    date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

interface ShareStatus {
  accessible: boolean;
  lastPublished: number | null;
  version?: string;
}

export default function DeployPage() {
  const [hosts, setHosts] = useState<DeployHost[]>([]);
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingHosts, setLoadingHosts] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "succeeded" | "failed" | "running" | "never">("all");
  const [verifiedJobs, setVerifiedJobs] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const autoOpenedBids = useRef<Set<string>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch the host list
  const fetchHosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy");
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("Access denied — admin or manager role required");
          return;
        }
        throw new Error(await res.text());
      }
      const data = await res.json();
      setHosts(data.hosts ?? []);
    } catch (err) {
      toast.error("Failed to load hosts");
      console.error(err);
    } finally {
      setLoadingHosts(false);
    }
  }, []);

  // Fetch recent deploy job statuses
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy/status");
      if (!res.ok) {
        console.error("[deploy] status fetch failed:", res.status, res.statusText);
        return;
      }
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch (err) {
      console.error("[deploy] status fetch error:", err);
    }
  }, []);

  // Fetch deploy share publish status
  const fetchShareStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy/publish");
      if (!res.ok) return;
      const data = await res.json();
      setShareStatus(data);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchHosts();
    fetchStatus();
    fetchShareStatus();
  }, [fetchHosts, fetchStatus, fetchShareStatus]);

  // Poll every 10s when any job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.runningFrames > 0 || j.waitingFrames > 0);
    if (hasRunning) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 10_000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, fetchStatus]);

  // Auto-open each new batch ID the first time it appears in the jobs list
  useEffect(() => {
    if (jobs.length === 0) return;
    const latestBid = jobBatchId(jobs[0].name);
    if (!latestBid || autoOpenedBids.current.has(latestBid)) return;
    setOpenBatches((prev) => new Set([...prev, latestBid]));
    autoOpenedBids.current.add(latestBid);
  }, [jobs]);

  // Build latest-deploy-per-host map (most recent job by startTime for each host tag)
  const latestByTag: Record<string, DeployJob> = {};
  for (const job of jobs) {
    const tag = jobHostTag(job.name);
    if (!tag) continue;
    if (!latestByTag[tag] || job.startTime > latestByTag[tag].startTime) {
      latestByTag[tag] = job;
    }
  }

  // Group jobs into deployment batches (same timestamp prefix = same deploy action)
  const batchMap: Record<string, DeployJob[]> = {};
  for (const job of jobs) {
    const bid = jobBatchId(job.name);
    if (!bid) continue;
    if (!batchMap[bid]) batchMap[bid] = [];
    batchMap[bid].push(job);
  }
  const batches = Object.entries(batchMap).sort(([a], [b]) => b.localeCompare(a));
  const latestBatch = batches[0];
  const latestBatchFailed = latestBatch
    ? latestBatch[1].filter((j) => ["DEAD", "PARTIAL"].includes(jobDisplayState(j)))
    : [];

  // Status chip counts — computed from full host list, unaffected by search
  const chipCounts = {
    all: hosts.length,
    succeeded: hosts.filter((h) => { const lj = latestByTag[h.specificTag]; return !!lj && jobDisplayState(lj) === "SUCCEEDED"; }).length,
    failed: hosts.filter((h) => { const lj = latestByTag[h.specificTag]; return !!lj && ["DEAD", "PARTIAL"].includes(jobDisplayState(lj)); }).length,
    running: hosts.filter((h) => { const lj = latestByTag[h.specificTag]; return !!lj && jobDisplayState(lj) === "RUNNING"; }).length,
    never: hosts.filter((h) => !latestByTag[h.specificTag]).length,
  };

  // Filtered hosts — search + status chip combined (AND logic)
  const filteredHosts = hosts.filter((h) => {
    if (search) {
      const q = search.toLowerCase();
      if (!h.specificTag.toLowerCase().includes(q) && !h.name.toLowerCase().includes(q) && !h.room.toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== "all") {
      const lj = latestByTag[h.specificTag];
      switch (statusFilter) {
        case "succeeded": return !!lj && jobDisplayState(lj) === "SUCCEEDED";
        case "failed":    return !!lj && ["DEAD", "PARTIAL"].includes(jobDisplayState(lj));
        case "running":   return !!lj && jobDisplayState(lj) === "RUNNING";
        case "never":     return !lj;
      }
    }
    return true;
  });

  // Group filtered hosts by room
  const rooms = [...new Set(filteredHosts.map((h) => h.room))].sort();

  // All-select logic scoped to filtered hosts
  const allFilteredIps = filteredHosts.map((h) => h.name);
  const allSelected = allFilteredIps.length > 0 && allFilteredIps.every((ip) => selected.has(ip));
  const someSelected = !allSelected && allFilteredIps.some((ip) => selected.has(ip));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allFilteredIps.forEach((ip) => next.delete(ip));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allFilteredIps]));
    }
  }

  function toggleHost(ip: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }

  function toggleBatch(batchId: string) {
    setOpenBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  function toggleVerifiedJob(jobId: string) {
    setVerifiedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function quickSelectByStatus(status: "failed" | "never") {
    const ips = hosts
      .filter((h) => {
        const lj = latestByTag[h.specificTag];
        if (status === "never") return !lj;
        return !!lj && ["DEAD", "PARTIAL"].includes(jobDisplayState(lj));
      })
      .map((h) => h.name);
    setSelected((prev) => new Set([...prev, ...ips]));
    toast.success(`Added ${ips.length} host${ips.length !== 1 ? "s" : ""} to selection`);
  }

  function selectLatestFailedBatch() {
    const failedTags = latestBatchFailed.map((j) => jobHostTag(j.name));
    const ips = hosts
      .filter((h) => failedTags.includes(h.specificTag))
      .map((h) => h.name);
    setSelected(new Set(ips));
    setStatusFilter("all");
    toast.success(`Selected ${ips.length} failed host${ips.length !== 1 ? "s" : ""} for re-deploy`);
  }

  async function handleDeploy() {
    if (selected.size === 0) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: [...selected] }),
      });
      const data = await res.json();
      if (data.submitted?.length > 0) {
        const labels = data.submitted.map((s: { label: string }) => s.label).join(", ");
        toast.success(`Deploy jobs submitted: ${labels}`);
        setSelected(new Set());
        // Refresh status after a moment
        setTimeout(fetchStatus, 1500);
      }
      if (data.errors?.length > 0) {
        for (const e of data.errors) {
          toast.error(`${e.label}: ${e.error}`);
        }
      }
    } catch (err) {
      toast.error("Deploy failed — check console");
      console.error(err);
    } finally {
      setDeploying(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/deploy/publish", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Published ${data.published} files to deploy share`);
        setShareStatus({ accessible: true, lastPublished: data.timestamp, version: data.version });
      } else if (data.published > 0) {
        toast.warning(`Published ${data.published} files, but ${data.failed} failed`);
        setShareStatus({ accessible: true, lastPublished: data.timestamp, version: data.version });
      } else {
        const firstError = data.results?.find((r: { ok: boolean; error?: string }) => !r.ok)?.error ?? "Unknown error";
        toast.error(`Publish failed: ${firstError}`);
      }
    } catch (err) {
      toast.error("Publish failed — check console");
      console.error(err);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Deploy</h1>
          <p className="text-sm text-text-muted mt-1">
            Push RQD / CueNimby updates to render farm hosts via OpenCue maintenance jobs.
          </p>
        </div>
        <button
          onClick={() => { fetchHosts(); fetchStatus(); fetchShareStatus(); }}
          className={getIconButtonClass("neutral", "md")}
          title="Refresh all"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Action bar: publish status + deploy button — always visible */}
      <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl px-4 py-3 flex items-center gap-4">
        {/* Publish status (left, fills available space) */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn("h-2 w-2 rounded-full shrink-0", shareStatus === null ? "bg-neutral-400 animate-pulse" : shareStatus.accessible ? "bg-success" : "bg-warning")} />
          <span className="text-sm font-medium text-text-primary shrink-0">Deploy Share</span>
          {shareStatus?.version && (
            <Badge variant="outline" className="text-[10px] py-0 h-5 font-mono flex items-center gap-0.5 shrink-0">
              <Tag className="h-2.5 w-2.5 mr-0.5" />{shareStatus.version}
            </Badge>
          )}
          <span className="text-xs text-text-muted truncate">
            {shareStatus === null
              ? "Checking…"
              : shareStatus.accessible
                ? shareStatus.lastPublished
                  ? `Last published ${formatDate(shareStatus.lastPublished)}`
                  : "Accessible — not yet published"
                : "Not accessible from this environment"}
          </span>
        </div>
        {/* Actions (right) */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handlePublish} disabled={publishing} className="gap-1.5">
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {publishing ? "Publishing…" : "Publish"}
          </Button>
          <div className="w-px h-5 bg-neutral-200 dark:bg-white/10" />
          <Button onClick={handleDeploy} disabled={selected.size === 0 || deploying} size="sm" className="gap-1.5">
            <Rocket className="h-3.5 w-3.5" />
            {deploying
              ? "Submitting…"
              : selected.size > 0
                ? `Deploy ${selected.size} host${selected.size !== 1 ? "s" : ""}`
                : "Deploy"}
          </Button>
        </div>
      </div>

      {/* Re-deploy banner — only when latest batch has failures */}
      {latestBatchFailed.length > 0 && (
        <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-danger shrink-0" />
            <span className="text-sm">
              <span className="font-medium text-text-primary">{latestBatchFailed.length} host{latestBatchFailed.length !== 1 ? "s" : ""}</span>
              <span className="text-text-muted"> failed in the last deploy batch.</span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={selectLatestFailedBatch}
            className="gap-1.5 border-danger/30 text-danger hover:bg-danger/5 shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-deploy failed
          </Button>
        </div>
      )}

      {/* Filter chips + quick-select shortcuts */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", "succeeded", "failed", "running", "never"] as const).map((f) => {
          const labels: Record<string, string> = { all: "All", succeeded: "Done", failed: "Failed", running: "Running", never: "Never" };
          const count = chipCounts[f];
          if (f !== "all" && count === 0) return null;
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                statusFilter === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-transparent text-text-muted border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 hover:text-text-primary"
              )}
            >
              {labels[f]} <span className={statusFilter === f ? "opacity-80" : "opacity-60"}>{count}</span>
            </button>
          );
        })}
        {chipCounts.failed > 0 && (
          <button
            onClick={() => quickSelectByStatus("failed")}
            className="ml-1 text-xs text-danger/70 hover:text-danger transition-colors hover:underline underline-offset-2"
          >
            Select {chipCounts.failed} failed
          </button>
        )}
        {chipCounts.never > 0 && (
          <button
            onClick={() => quickSelectByStatus("never")}
            className="text-xs text-text-muted/70 hover:text-text-primary transition-colors hover:underline underline-offset-2"
          >
            Select {chipCounts.never} never deployed
          </button>
        )}
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search hosts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <span className="text-xs text-text-muted">
          {selected.size > 0 ? `${selected.size} selected` : `${filteredHosts.length} hosts`}
        </span>
      </div>

      {/* Hosts table — full width */}
      {loadingHosts ? (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 p-8 text-center text-sm text-text-muted">
          Loading hosts…
        </div>
      ) : filteredHosts.length === 0 ? (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 p-8 text-center text-sm text-text-muted">
          {search ? "No hosts match your filter." : "No render farm hosts found."}
        </div>
      ) : (
        rooms.map((room, roomIdx) => {
          const roomHosts = filteredHosts.filter((h) => h.room === room);
          const colors = accentColorList[roomIdx % accentColorList.length];
          const roomSelected = roomHosts.filter((h) => selected.has(h.name)).length;
          const roomStats = roomSelected > 0 ? `${roomSelected} selected` : undefined;
          return (
            <GroupedSection
              key={room}
              title={room}
              badge={String(roomHosts.length)}
              stats={roomStats}
              accentColors={colors}
              defaultOpen
            >
              <ResizableTable>
                <ResizableTableHeader>
                  <ResizableTableRow>
                    <ResizableTableHead className="w-10">
                      <button
                        onClick={() => {
                          const roomIps = roomHosts.map((h) => h.name);
                          const allRoomSelected = roomIps.every((ip) => selected.has(ip));
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (allRoomSelected) roomIps.forEach((ip) => next.delete(ip));
                            else roomIps.forEach((ip) => next.add(ip));
                            return next;
                          });
                        }}
                        className="text-text-muted hover:text-text-primary transition-colors"
                        title="Select all in room"
                      >
                        {roomHosts.every((h) => selected.has(h.name)) ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </ResizableTableHead>
                    <ResizableTableHead>Host</ResizableTableHead>
                    <ResizableTableHead>IP</ResizableTableHead>
                    <ResizableTableHead>State</ResizableTableHead>
                    <ResizableTableHead>Lock</ResizableTableHead>
                    <ResizableTableHead>Last Deploy</ResizableTableHead>
                    <ResizableTableHead className="text-center w-16">Tray</ResizableTableHead>
                  </ResizableTableRow>
                </ResizableTableHeader>
                <ResizableTableBody>
                  {roomHosts.map((host) => {
                    const lj = latestByTag[host.specificTag];
                    const isVerified = lj ? verifiedJobs.has(lj.id) : false;
                    return (
                      <ResizableTableRow
                        key={host.id}
                        className={cn(
                          "cursor-pointer",
                          selected.has(host.name)
                            ? "bg-primary/5 dark:bg-primary/10"
                            : (() => {
                                if (!lj) return "";
                                const ds = jobDisplayState(lj);
                                if (ds === "SUCCEEDED") return "bg-success/4 dark:bg-success/6";
                                if (ds === "DEAD" || ds === "PARTIAL") return "bg-danger/4 dark:bg-danger/6";
                                return "";
                              })()
                        )}
                        onClick={() => toggleHost(host.name)}
                      >
                        <ResizableTableCell>
                          {selected.has(host.name) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-text-muted" />
                          )}
                        </ResizableTableCell>
                        <ResizableTableCell className="font-mono text-sm font-medium">
                          {host.specificTag}
                        </ResizableTableCell>
                        <ResizableTableCell className="font-mono text-xs text-text-muted">
                          {host.name}
                        </ResizableTableCell>
                        <ResizableTableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] py-0 h-5", stateColors[host.state] ?? stateColors.UNKNOWN)}
                          >
                            {host.state}
                          </Badge>
                        </ResizableTableCell>
                        <ResizableTableCell>
                          {host.lockState !== "OPEN" && (
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] py-0 h-5", lockColors[host.lockState] ?? "")}
                            >
                              {host.lockState.replace("_", " ")}
                            </Badge>
                          )}
                        </ResizableTableCell>
                        <ResizableTableCell>
                          {!lj ? (
                            <span className="text-[11px] text-text-muted">—</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const ds = jobDisplayState(lj);
                                if (ds === "SUCCEEDED") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
                                if (ds === "DEAD") return <XCircle className="h-3.5 w-3.5 text-danger" />;
                                if (ds === "RUNNING") return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
                                return <Clock className="h-3.5 w-3.5 text-text-muted" />;
                              })()}
                              <span className="text-[11px] text-text-muted">{formatDate(lj.startTime)}</span>
                            </div>
                          )}
                        </ResizableTableCell>
                        <ResizableTableCell className="text-center">
                          {lj ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleVerifiedJob(lj.id); }}
                              title={isVerified ? "Tray confirmed — click to unmark" : "Click to confirm system tray version"}
                              className={cn(
                                "transition-colors mx-auto block",
                                isVerified ? "text-success" : "text-text-muted/30 hover:text-text-muted"
                              )}
                            >
                              {isVerified ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="text-text-muted/20 text-xs">—</span>
                          )}
                        </ResizableTableCell>
                      </ResizableTableRow>
                    );
                  })}
                </ResizableTableBody>
              </ResizableTable>
            </GroupedSection>
          );
        })
      )}

      {/* Select-all / clear bar */}
      {filteredHosts.length > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : someSelected ? (
              <CheckSquare className="h-3.5 w-3.5 opacity-50" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {allSelected ? "Deselect all" : "Select all visible"}
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-text-muted hover:text-danger transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Deploy history — collapsible, closed by default */}
      <div className="space-y-2">
        <button
          onClick={() => setShowHistory((prev) => !prev)}
          className="flex items-center gap-2 text-sm font-medium text-text-primary hover:opacity-80 transition-opacity w-full text-left"
        >
          <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform shrink-0", showHistory && "rotate-180")} />
          <span>Deploy History</span>
          {batches.length > 0 && (
            <span className="text-xs text-text-muted font-normal">({batches.length} batch{batches.length !== 1 ? "es" : ""})</span>
          )}
          {latestBatch && (
            <div className="flex items-center gap-0.5 ml-2" title="Latest batch">
              {[...latestBatch[1]]
                .sort((a, b) => jobHostTag(a.name).localeCompare(jobHostTag(b.name)))
                .map((job) => {
                  const ds = jobDisplayState(job);
                  return (
                    <div
                      key={job.id}
                      title={`${jobHostTag(job.name)}: ${ds}`}
                      className={cn(
                        "h-2 w-2 rounded-sm shrink-0",
                        ds === "SUCCEEDED" ? "bg-success" :
                        ds === "RUNNING"   ? "bg-blue-500 animate-pulse" :
                        ds === "DEAD"      ? "bg-danger" :
                        ds === "PARTIAL"   ? "bg-warning" :
                        "bg-neutral-300 dark:bg-neutral-600"
                      )}
                    />
                  );
                })}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); fetchStatus(); }}
            className={cn(getIconButtonClass("neutral", "sm"), "ml-auto shrink-0")}
            title="Refresh deployments"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </button>

        {showHistory && (
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl overflow-hidden divide-y divide-neutral-100 dark:divide-white/5">
            {batches.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">
                No recent deploy jobs found.
                <br />
                <span className="text-xs opacity-70">Jobs appear here after you submit a deployment.</span>
              </div>
            ) : (
              batches.map(([batchId, batchJobs]) => {
                const isOpen = openBatches.has(batchId);
                const sortedJobs = [...batchJobs].sort((a, b) => jobHostTag(a.name).localeCompare(jobHostTag(b.name)));
                const succeeded = batchJobs.filter((j) => jobDisplayState(j) === "SUCCEEDED").length;
                const failed = batchJobs.filter((j) => ["DEAD", "PARTIAL"].includes(jobDisplayState(j))).length;
                const running = batchJobs.filter((j) => jobDisplayState(j) === "RUNNING").length;
                const pending = batchJobs.filter((j) => ["PENDING", "PAUSED"].includes(jobDisplayState(j))).length;
                const batchVerified = batchJobs.filter((j) => verifiedJobs.has(j.id)).length;
                return (
                  <div key={batchId}>
                    <button
                      onClick={() => toggleBatch(batchId)}
                      className="w-full px-4 py-3 flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors text-left"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 text-text-muted transition-transform shrink-0", isOpen && "rotate-180")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{formatBatchId(batchId)}</span>
                          <span className="text-xs text-text-muted">{batchJobs.length} host{batchJobs.length !== 1 ? "s" : ""}</span>
                          {batchVerified > 0 && (
                            <span className="text-[10px] text-success font-medium">{batchVerified}/{batchJobs.length} tray ✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 mt-1.5 flex-wrap">
                          {sortedJobs.map((job) => {
                            const ds = jobDisplayState(job);
                            return (
                              <div
                                key={job.id}
                                title={`${jobHostTag(job.name)}: ${ds}`}
                                className={cn(
                                  "h-2 w-2 rounded-sm shrink-0",
                                  ds === "SUCCEEDED" ? "bg-success" :
                                  ds === "RUNNING"   ? "bg-blue-500 animate-pulse" :
                                  ds === "DEAD"      ? "bg-danger" :
                                  ds === "PARTIAL"   ? "bg-warning" :
                                  "bg-neutral-300 dark:bg-neutral-600"
                                )}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-medium shrink-0">
                        {succeeded > 0 && <span className="text-success">✓ {succeeded}</span>}
                        {running > 0 && <span className="text-blue-500">▶ {running}</span>}
                        {pending > 0 && <span className="text-text-muted">⌛ {pending}</span>}
                        {failed > 0 && <span className="text-danger">✗ {failed}</span>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 divide-y divide-neutral-100 dark:divide-white/5">
                        {sortedJobs.map((job) => {
                          const tag = jobHostTag(job.name);
                          const ds = jobDisplayState(job);
                          const isJobVerified = verifiedJobs.has(job.id);
                          return (
                            <div key={job.id} className="flex items-center justify-between py-2 gap-3">
                              <span className="font-mono text-sm flex-1">{tag || job.name}</span>
                              <span className="flex items-center gap-1.5 text-xs font-medium">
                                {ds === "SUCCEEDED" && <><CheckCircle2 className="h-3.5 w-3.5 text-success" /><span className="text-success">Done</span></>}
                                {ds === "DEAD"      && <><XCircle className="h-3.5 w-3.5 text-danger" /><span className="text-danger">Failed</span></>}
                                {ds === "PARTIAL"   && <><XCircle className="h-3.5 w-3.5 text-warning" /><span className="text-warning">Partial</span></>}
                                {ds === "RUNNING"   && <><Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" /><span className="text-blue-500">Running</span></>}
                                {(ds === "PENDING" || ds === "PAUSED") && <><Clock className="h-3.5 w-3.5 text-text-muted" /><span className="text-text-muted">Waiting</span></>}
                              </span>
                              <button
                                onClick={() => toggleVerifiedJob(job.id)}
                                title={isJobVerified ? "Tray confirmed — click to unmark" : "Click to mark system tray verified"}
                                className={cn(
                                  "flex items-center gap-1 text-[11px] transition-colors shrink-0 select-none",
                                  isJobVerified ? "text-success" : "text-text-muted/40 hover:text-text-muted"
                                )}
                              >
                                {isJobVerified ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                                <span className={isJobVerified ? "font-medium" : ""}>{isJobVerified ? "Tray ✓" : "Tray"}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
