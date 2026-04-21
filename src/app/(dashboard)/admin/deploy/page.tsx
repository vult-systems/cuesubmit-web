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
import { RefreshCw, Rocket, Search, CheckSquare, Square, Clock, ChevronDown, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

/** Extract the host tag (e.g. "AD404-05") from a deploy job name */
function jobHostTag(name: string): string {
  const m = name.match(/AD\d+-\w+$/);
  return m ? m[0] : "";
}

/** Extract the batch timestamp prefix (e.g. "2026-04-21-14-35") from a deploy job name */
function jobBatchId(name: string): string {
  const prefix = "maintenance-rqd-update-";
  if (!name.startsWith(prefix)) return name.slice(0, 16);
  return name.slice(prefix.length, prefix.length + 16);
}

/** Format a batch ID for display (e.g. "2026-04-21-14-35" → "Apr 21, 2:35 PM") */
function formatBatchId(batchId: string): string {
  const parts = batchId.split("-");
  if (parts.length < 5) return batchId;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(parts[3]), Number(parts[4]));
  return (
    date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export default function DeployPage() {
  const [hosts, setHosts] = useState<DeployHost[]>([]);
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingHosts, setLoadingHosts] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
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
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      // silently ignore — just means status isn't refreshed
    }
  }, []);

  useEffect(() => {
    fetchHosts();
    fetchStatus();
  }, [fetchHosts, fetchStatus]);

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

  // Filtered hosts
  const filteredHosts = hosts.filter((h) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      h.specificTag.toLowerCase().includes(q) ||
      h.name.toLowerCase().includes(q) ||
      h.room.toLowerCase().includes(q)
    );
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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Deploy</h1>
          <p className="text-sm text-text-muted mt-1">
            Push RQD / CueNimby updates to render farm hosts via OpenCue maintenance jobs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchHosts(); fetchStatus(); }}
            className={getIconButtonClass("neutral", "md")}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Button
            onClick={handleDeploy}
            disabled={selected.size === 0 || deploying}
            className="gap-2"
          >
            <Rocket className="h-4 w-4" />
            {deploying
              ? "Submitting…"
              : selected.size > 0
                ? `Deploy to ${selected.size} host${selected.size !== 1 ? "s" : ""}`
                : "Deploy"}
          </Button>
        </div>
      </div>

      {/* Two-column layout: hosts + recent jobs */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        {/* ── Hosts panel ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                placeholder="Filter hosts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <span className="text-xs text-text-muted">
              {selected.size > 0 ? `${selected.size} selected` : `${filteredHosts.length} hosts`}
            </span>
          </div>

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
              return (
                <GroupedSection
                  key={room}
                  title={room}
                  badge={String(roomHosts.length)}
                  stats={roomSelected > 0 ? `${roomSelected} selected` : undefined}
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
                      </ResizableTableRow>
                    </ResizableTableHeader>
                    <ResizableTableBody>
                      {roomHosts.map((host) => (
                        <ResizableTableRow
                          key={host.id}
                          className={cn(
                            "cursor-pointer",
                            selected.has(host.name) && "bg-primary/5 dark:bg-primary/10"
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
                            {(() => {
                              const lj = latestByTag[host.specificTag];
                              if (!lj) return <span className="text-[11px] text-text-muted">—</span>;
                              const ds = jobDisplayState(lj);
                              return (
                                <div className="flex items-center gap-1.5">
                                  {ds === "SUCCEEDED" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                                  {ds === "DEAD" && <XCircle className="h-3.5 w-3.5 text-danger" />}
                                  {ds === "RUNNING" && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />}
                                  {(ds === "PENDING" || ds === "PAUSED") && <Clock className="h-3.5 w-3.5 text-text-muted" />}
                                  <span className="text-[11px] text-text-muted">{formatDate(lj.startTime)}</span>
                                </div>
                              );
                            })()}
                          </ResizableTableCell>
                        </ResizableTableRow>
                      ))}
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
        </div>

        {/* ── Recent deployments panel ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Recent Deployments</h2>
            <button
              onClick={fetchStatus}
              className={getIconButtonClass("neutral", "sm")}
              title="Refresh status"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl overflow-hidden divide-y divide-neutral-100 dark:divide-white/5">
            {batches.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">
                No recent deploy jobs found.
                <br />
                <span className="text-xs opacity-70">
                  Jobs appear here after you submit a deployment.
                </span>
              </div>
            ) : (
              batches.map(([batchId, batchJobs]) => {
                const isOpen = openBatches.has(batchId);
                const succeeded = batchJobs.filter((j) => jobDisplayState(j) === "SUCCEEDED").length;
                const failed = batchJobs.filter((j) => ["DEAD", "PARTIAL"].includes(jobDisplayState(j))).length;
                const running = batchJobs.filter((j) => jobDisplayState(j) === "RUNNING").length;
                const pending = batchJobs.filter((j) => ["PENDING", "PAUSED"].includes(jobDisplayState(j))).length;
                return (
                  <div key={batchId}>
                    <button
                      onClick={() => toggleBatch(batchId)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-text-muted transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                        <span className="text-sm font-medium">{formatBatchId(batchId)}</span>
                        <span className="text-xs text-text-muted">
                          {batchJobs.length} host{batchJobs.length !== 1 ? "s" : ""}
                        </span>
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
                        {[...batchJobs]
                          .sort((a, b) => jobHostTag(a.name).localeCompare(jobHostTag(b.name)))
                          .map((job) => {
                            const tag = jobHostTag(job.name);
                            const ds = jobDisplayState(job);
                            return (
                              <div key={job.id} className="flex items-center justify-between py-2">
                                <span className="font-mono text-sm">{tag || job.name}</span>
                                <span className="flex items-center gap-1.5 text-xs font-medium">
                                  {ds === "SUCCEEDED" && (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                      <span className="text-success">Done</span>
                                    </>
                                  )}
                                  {ds === "DEAD" && (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 text-danger" />
                                      <span className="text-danger">Failed</span>
                                    </>
                                  )}
                                  {ds === "PARTIAL" && (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 text-warning" />
                                      <span className="text-warning">Partial</span>
                                    </>
                                  )}
                                  {ds === "RUNNING" && (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                                      <span className="text-blue-500">Running</span>
                                    </>
                                  )}
                                  {(ds === "PENDING" || ds === "PAUSED") && (
                                    <>
                                      <Clock className="h-3.5 w-3.5 text-text-muted" />
                                      <span className="text-text-muted">Waiting</span>
                                    </>
                                  )}
                                </span>
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
        </div>
      </div>
    </div>
  );
}
