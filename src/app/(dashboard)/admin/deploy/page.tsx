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
import { RefreshCw, Rocket, Search, CheckSquare, Square, Clock, ChevronDown } from "lucide-react";
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

const jobStateColors: Record<string, string> = {
  SUCCEEDED: "text-success",
  DEAD: "text-danger",
  RUNNING: "text-blue-500",
  PENDING: "text-text-muted",
  PAUSED: "text-warning",
  EATEN: "text-text-muted",
  DEPEND: "text-purple-500",
};

function formatDate(unix: number): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Extract the host tag suffix from a job name, e.g. "maintenance-rqd-update-2025-01-02-10-30-AD404-05" → "AD404-05" */
function jobHostLabel(name: string): string {
  const m = name.match(/AD\d+-\d+$/);
  return m ? m[0] : name;
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

export default function DeployPage() {
  const [hosts, setHosts] = useState<DeployHost[]>([]);
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingHosts, setLoadingHosts] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [showAllJobs, setShowAllJobs] = useState(false);

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

  const visibleJobs = showAllJobs ? jobs : jobs.slice(0, 10);

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
            {jobs.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">
                No recent deploy jobs found.
                <br />
                <span className="text-xs opacity-70">
                  Jobs appear here after you submit a deployment.
                </span>
              </div>
            ) : (
              <>
                {visibleJobs.map((job) => {
                  const displayState = jobDisplayState(job);
                  const stateColor = jobStateColors[displayState] ?? "text-text-muted";
                  return (
                    <div key={job.id} className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-sm font-medium">
                            {jobHostLabel(job.name)}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="h-3 w-3 text-text-muted" />
                            <span className="text-[11px] text-text-muted">
                              {formatDate(job.startTime)}
                            </span>
                          </div>
                        </div>
                        <span className={cn("text-xs font-medium shrink-0 mt-0.5", stateColor)}>
                          {displayState}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
                        {job.succeededFrames > 0 && (
                          <span className="text-success">✓ {job.succeededFrames}</span>
                        )}
                        {job.runningFrames > 0 && (
                          <span className="text-blue-500">▶ {job.runningFrames}</span>
                        )}
                        {job.waitingFrames > 0 && (
                          <span>⌛ {job.waitingFrames}</span>
                        )}
                        {job.deadFrames > 0 && (
                          <span className="text-danger">✗ {job.deadFrames}</span>
                        )}
                        <span className="opacity-50">/ {job.totalFrames} frames</span>
                      </div>
                    </div>
                  );
                })}
                {jobs.length > 10 && (
                  <button
                    onClick={() => setShowAllJobs((v) => !v)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform", showAllJobs && "rotate-180")}
                    />
                    {showAllJobs ? "Show fewer" : `Show ${jobs.length - 10} more`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
