"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RotateCcw,
  Trash2,
  Play,
  Pause,
  XCircle,
  RefreshCw,
  CheckSquare,
  Square,
  Download,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getExitCodeLabel, getExitCodeColorClass } from "@/lib/exit-codes";

interface Frame {
  id: string;
  name: string;
  number: number;
  state: string;
  retryCount: number;
  exitStatus: number;
  lastResource: string;
  startTime: number;
  stopTime: number;
  chunkNumber?: number;
  chunkSize?: number;
}

interface Job {
  id: string;
  name: string;
  state: string;
  isPaused: boolean;
  user: string;
  show: string;
  priority: number;
  pendingFrames: number;
  runningFrames: number;
  deadFrames: number;
  succeededFrames: number;
  totalFrames: number;
}

interface JobDetailDrawerProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobUpdated: () => void;
}

const frameStateColors: Record<string, string> = {
  WAITING: "bg-surface-muted text-text-muted border-border",
  RUNNING: "bg-blue-500/15 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
  SUCCEEDED: "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/20",
  DEAD: "bg-red-500/15 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 dark:border-red-500/20",
  DEPEND: "bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20",
  EATEN: "bg-surface-muted text-text-muted border-border",
  CHECKPOINT: "bg-blue-500/15 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
};

// Subtle row background tints per frame state
const frameRowColors: Record<string, string> = {
  WAITING: "",
  RUNNING: "bg-blue-500/[0.04] dark:bg-blue-500/[0.03] hover:bg-blue-500/[0.07] dark:hover:bg-blue-500/[0.06]",
  SUCCEEDED: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.03] hover:bg-emerald-500/[0.07] dark:hover:bg-emerald-500/[0.06]",
  DEAD: "bg-red-500/[0.06] dark:bg-red-500/[0.05] hover:bg-red-500/[0.09] dark:hover:bg-red-500/[0.08]",
  DEPEND: "bg-amber-500/[0.04] dark:bg-amber-500/[0.03] hover:bg-amber-500/[0.07] dark:hover:bg-amber-500/[0.06]",
  EATEN: "bg-neutral-500/[0.03] dark:bg-neutral-500/[0.02] hover:bg-neutral-500/[0.06] dark:hover:bg-neutral-500/[0.05]",
  CHECKPOINT: "bg-blue-500/[0.04] dark:bg-blue-500/[0.03] hover:bg-blue-500/[0.07] dark:hover:bg-blue-500/[0.06]",
};

export function JobDetailDrawer({
  job,
  open,
  onOpenChange,
  onJobUpdated,
}: Readonly<JobDetailDrawerProps>) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  // Host IP/name → display ID lookup map
  const [hostLookup, setHostLookup] = useState<Record<string, string>>({});
  // Frame selected for log viewing (single click)
  const [activeFrame, setActiveFrame] = useState<Frame | null>(null);
  // Log viewer state
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logPanelCollapsed, setLogPanelCollapsed] = useState(false);
  const logScrollRef = useRef<HTMLDivElement>(null);
  // Draggable log panel height (in pixels)
  const [logPanelHeight, setLogPanelHeight] = useState(400);
  // Frame preview state
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const prevPreviewUrlRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  // Clean up blob URLs to prevent memory leaks
  useEffect(() => {
    if (prevPreviewUrlRef.current && prevPreviewUrlRef.current !== previewUrl) {
      URL.revokeObjectURL(prevPreviewUrlRef.current);
    }
    prevPreviewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Drag handlers for resizable log panel
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = logPanelHeight;

    const handleDragMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartYRef.current - moveEvent.clientY;
      const newHeight = Math.max(120, Math.min(800, dragStartHeightRef.current + delta));
      setLogPanelHeight(newHeight);
    };

    const handleDragEnd = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [logPanelHeight]);

  const fetchFrames = useCallback(async () => {
    if (!job) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/frames`);
      const data = await response.json();
      if (response.ok) {
        setFrames(data.frames || []);
      } else {
        toast.error(data.error || "Failed to fetch frames");
      }
    } catch (error) {
      console.error("Failed to fetch frames:", error);
      toast.error("Failed to fetch frames");
    } finally {
      setLoading(false);
    }
  }, [job]);

  useEffect(() => {
    if (open && job) {
      fetchFrames();
      setSelectedFrames(new Set());
      setActiveFrame(null);
      setLogs("");
      setPreviewUrl(null);
      setPreviewError(null);
      // Fetch host lookup map
      fetch("/api/host-lookup")
        .then(r => r.json())
        .then(d => setHostLookup(d.lookup || {}))
        .catch(() => {});
      // Fetch layers to get output directory from command
      fetch(`/api/jobs/${job.id}/layers`)
        .then(r => r.json())
        .then(d => {
          const layers = d.layers || [];
          if (layers.length > 0) {
            const cmd = layers[0].command || "";
            // Extract output directory from -rd "path" in the Maya render command
            const rdMatch = cmd.match(/-rd\s+"([^"]+)"/);
            if (rdMatch) {
              setOutputDir(rdMatch[1]);
            } else {
              setOutputDir(null);
            }
          } else {
            setOutputDir(null);
          }
        })
        .catch(() => setOutputDir(null));
    }
  }, [open, job, fetchFrames]);

  // Fetch logs when activeFrame changes
  const fetchLogs = useCallback(async () => {
    if (!activeFrame || !job) return;
    setLogsLoading(true);
    try {
      const response = await fetch(
        `/api/jobs/${job.id}/logs?frame=${activeFrame.number}&layer=render`
      );
      const data = await response.json();
      
      if (response.ok && data.logs && !data.error) {
        setLogs(data.logs);
      } else {
        setLogs(data.logs || data.error || "No logs available for this frame.");
      }
    } catch (error) {
      console.error("Failed to fetch frame logs:", error);
      setLogs(`Failed to fetch logs: ${error instanceof Error ? error.message : "Connection error"}`);
    } finally {
      setLogsLoading(false);
    }
  }, [activeFrame, job]);

  // Fetch preview image when activeFrame changes
  const fetchPreview = useCallback(async () => {
    if (!activeFrame || !outputDir) {
      setPreviewUrl(null);
      setPreviewError(activeFrame && !outputDir ? "No output directory found in layer command" : null);
      return;
    }

    // Only attempt preview for succeeded frames
    if (activeFrame.state !== "SUCCEEDED") {
      setPreviewUrl(null);
      setPreviewError(
        activeFrame.state === "RUNNING"
          ? "Frame is still rendering…"
          : activeFrame.state === "DEAD"
            ? "Frame failed — no output available"
            : activeFrame.state === "WAITING"
              ? "Frame hasn't started yet"
              : `Frame state: ${activeFrame.state}`
      );
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);

    try {
      // Single API call that handles path resolution, directory scanning, and image serving
      const url = `/api/files/frame-preview?dir=${encodeURIComponent(outputDir)}&frame=${activeFrame.number}`;
      const res = await fetch(url);

      if (res.ok) {
        // Response is the image itself — create a blob URL
        const blob = await res.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      } else {
        const data = await res.json();
        setPreviewError(data.error || "No preview available");
      }
    } catch (error) {
      console.error("Preview fetch error:", error);
      setPreviewError("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [activeFrame, outputDir]);

  useEffect(() => {
    if (activeFrame) {
      fetchPreview();
      fetchLogs();
      setLogPanelCollapsed(false);
    }
  }, [activeFrame, fetchPreview, fetchLogs]);

  useEffect(() => {
    if (autoScroll && logScrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has rendered new content
      requestAnimationFrame(() => {
        if (logScrollRef.current) {
          logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
        }
      });
    }
  }, [logs, autoScroll]);

  const handleJobAction = async (action: string, frameIds?: string[]) => {
    if (!job) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, frameIds }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`${action} successful`);
        fetchFrames();
        onJobUpdated();
        setSelectedFrames(new Set());
      } else {
        toast.error(data.error || `Failed to ${action}`);
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
      toast.error(`Failed to ${action}`);
    } finally {
      setActionLoading(false);
    }
  };

  const deadFrames = frames.filter((f) => f.state === "DEAD");
  const selectedDeadFrames = Array.from(selectedFrames).filter((id) =>
    deadFrames.some((f) => f.id === id)
  );

  const toggleFrame = (frameId: string) => {
    const newSelected = new Set(selectedFrames);
    if (newSelected.has(frameId)) {
      newSelected.delete(frameId);
    } else {
      newSelected.add(frameId);
    }
    setSelectedFrames(newSelected);
  };

  const selectAllDead = () => {
    const deadIds = deadFrames.map((f) => f.id);
    setSelectedFrames(new Set(deadIds));
  };

  const clearSelection = () => {
    setSelectedFrames(new Set());
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  // Resolve lastResource (e.g. "REDACTED_IP/1.0/3300") to display ID (e.g. "AD405-01")
  const resolveHost = (lastResource: string | undefined) => {
    if (!lastResource) return "-";
    const hostPart = lastResource.split("/")[0];
    return hostLookup[hostPart] || hostPart.toUpperCase();
  };

  const handleFrameClick = (frame: Frame) => {
    setActiveFrame(frame);
  };

  const handleDownloadLog = () => {
    if (!activeFrame || !logs || !job) return;
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.name.replaceAll(/[^a-z0-9]/gi, "_")}_frame_${activeFrame.number}_log.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Log downloaded");
  };

  const getLogLineColor = (line: string) => {
    if (line.includes("ERROR") || line.includes("FATAL")) return "text-red-600 dark:text-red-400";
    if (line.includes("WARN")) return "text-amber-600 dark:text-amber-400";
    if (line.includes("DEBUG")) return "text-text-muted";
    if (line.includes("INFO")) return "text-text-secondary";
    if (line.includes("[LIVE]")) return "text-blue-600 dark:text-blue-400 animate-pulse";
    if (line.startsWith("===")) return "text-text-muted opacity-50";
    return "text-text-muted";
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[98vw] h-[94vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b border-neutral-200 dark:border-white/8 px-5 py-3 shrink-0">
          <DialogTitle className="text-text-primary text-lg font-semibold pr-8">
            {job.name}
          </DialogTitle>
          <div className="flex items-center gap-6 text-sm text-text-muted mt-1.5">
            <span>User: <span className="text-text-secondary">{job.user}</span></span>
            <span>Show: <span className="text-text-secondary">{job.show}</span></span>
            <span>Priority: <span className="text-text-secondary">{job.priority}</span></span>
          </div>
        </DialogHeader>

        {/* Main content area - horizontal split: frames+logs | preview */}
        <div className="flex-1 overflow-hidden flex flex-row min-h-0">
          {/* Left column: frames table + log viewer */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Job Actions Bar */}
          <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap shrink-0 border-b border-neutral-200/60 dark:border-white/5">
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction(job.isPaused ? "resume" : "pause")}
              disabled={actionLoading}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-7 px-2.5 text-xs rounded-lg"
            >
              {job.isPaused ? (
                <><Play className="h-3 w-3 mr-1" /> Resume</>
              ) : (
                <><Pause className="h-3 w-3 mr-1" /> Pause</>
              )}
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction("retry")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-7 px-2.5 text-xs rounded-lg"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Retry Dead ({deadFrames.length})
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction("eat")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-7 px-2.5 text-xs rounded-lg"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Eat Dead
            </Button>
            <Button
              variant="destructive"
              size="default"
              onClick={() => handleJobAction("kill")}
              disabled={actionLoading}
              className="h-7 px-2.5 text-xs rounded-lg"
            >
              <XCircle className="h-3 w-3 mr-1" /> Kill
            </Button>

            {/* Selection actions */}
            {selectedFrames.size > 0 && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-neutral-200 dark:border-white/10">
                <span className="text-xs text-text-muted font-medium">
                  {selectedFrames.size} selected
                </span>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => handleJobAction("retry", Array.from(selectedFrames))}
                  disabled={actionLoading || selectedDeadFrames.length === 0}
                  className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 h-6 px-2 text-[10px] rounded-md"
                >
                  <RotateCcw className="h-2.5 w-2.5 mr-0.5" /> Retry
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => handleJobAction("eat", Array.from(selectedFrames))}
                  disabled={actionLoading || selectedDeadFrames.length === 0}
                  className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 h-6 px-2 text-[10px] rounded-md"
                >
                  <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Eat
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={clearSelection}
                  className="text-text-muted hover:text-text-primary h-6 px-2 text-[10px] rounded-md"
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Quick tools */}
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="default"
                onClick={selectAllDead}
                disabled={deadFrames.length === 0}
                className="text-text-muted hover:text-text-primary h-6 px-2 text-[10px] rounded-md"
              >
                <CheckSquare className="h-2.5 w-2.5 mr-0.5" /> Select Dead
              </Button>
              <Button
                variant="ghost"
                size="default"
                onClick={clearSelection}
                disabled={selectedFrames.size === 0}
                className="text-text-muted hover:text-text-primary h-6 px-2 text-[10px] rounded-md"
              >
                <Square className="h-2.5 w-2.5 mr-0.5" /> Clear
              </Button>
              <Button
                variant="ghost"
                size="default"
                onClick={fetchFrames}
                disabled={loading}
                className="text-text-muted hover:text-text-primary h-6 px-2 text-[10px] rounded-md"
              >
                <RefreshCw className={cn("h-2.5 w-2.5 mr-0.5", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Frames Table - takes remaining height */}
          <div className="overflow-hidden flex flex-col min-h-0 flex-1">
            <ScrollArea className="flex-1 min-h-0">
              <div className="rounded-lg border border-neutral-200/80 dark:border-white/6 bg-white/60 dark:bg-white/2 mx-4 my-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-neutral-200 dark:border-white/6 hover:bg-transparent">
                      <TableHead className="w-8 pl-3"></TableHead>
                      <TableHead className="text-xs">Frame</TableHead>
                      <TableHead className="text-xs">Layer</TableHead>
                      <TableHead className="text-xs">State</TableHead>
                      <TableHead className="text-xs">Retries</TableHead>
                      <TableHead className="text-xs">Exit</TableHead>
                      <TableHead className="text-xs">Host</TableHead>
                      <TableHead className="text-xs">Start</TableHead>
                      <TableHead className="text-xs">Stop</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-text-muted text-sm">
                          Loading frames...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && frames.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-text-muted text-sm">
                          No frames found
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && frames.length > 0 && frames.map((frame) => {
                      const isActive = activeFrame?.id === frame.id;
                      const duration = frame.stopTime && frame.startTime
                        ? ((frame.stopTime - frame.startTime) / 1000).toFixed(1) + "s"
                        : frame.state === "RUNNING" && frame.startTime
                          ? ((Date.now() / 1000 - frame.startTime)).toFixed(0) + "s..."
                          : "-";
                      
                      return (
                        <TableRow
                          key={frame.id}
                          className={cn(
                            "border-neutral-200 dark:border-white/6 cursor-pointer transition-colors duration-100",
                            isActive 
                              ? "bg-blue-500/10 dark:bg-blue-500/8 hover:bg-blue-500/15 dark:hover:bg-blue-500/12" 
                              : frameRowColors[frame.state] || "hover:bg-neutral-50 dark:hover:bg-white/3",
                            selectedFrames.has(frame.id) && !isActive && "bg-blue-500/5"
                          )}
                          onClick={() => handleFrameClick(frame)}
                        >
                          <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedFrames.has(frame.id)}
                              onCheckedChange={() => toggleFrame(frame.id)}
                              disabled={frame.state !== "DEAD"}
                              className="h-3.5 w-3.5"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-text-primary text-xs py-1.5">
                            {frame.number}
                          </TableCell>
                          <TableCell className="text-text-muted font-mono text-xs py-1.5">
                            {frame.name || "-"}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                frameStateColors[frame.state] || "bg-surface-muted text-text-muted"
                              )}
                            >
                              {frame.state}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-text-muted text-xs py-1.5">
                            {frame.retryCount}
                          </TableCell>
                          <TableCell className={cn("text-xs py-1.5", getExitCodeColorClass(frame.exitStatus))} title={`Exit code: ${frame.exitStatus}`}>
                            {getExitCodeLabel(frame.exitStatus)}
                          </TableCell>
                          <TableCell className="text-text-muted text-xs truncate max-w-36 py-1.5" title={frame.lastResource || undefined}>
                            {resolveHost(frame.lastResource)}
                          </TableCell>
                          <TableCell className="text-text-muted text-xs py-1.5">
                            {formatTime(frame.startTime)}
                          </TableCell>
                          <TableCell className="text-text-muted text-xs py-1.5">
                            {formatTime(frame.stopTime)}
                          </TableCell>
                          <TableCell className="text-text-muted text-xs py-1.5 font-mono">
                            {duration}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </div>

          {/* Frame Summary Bar */}
          <div className="flex items-center gap-4 text-[10px] border-t border-neutral-200 dark:border-white/8 px-5 py-1.5 shrink-0 bg-neutral-50/50 dark:bg-white/2">
            <span className="text-emerald-500 font-medium">
              Succeeded: {job.succeededFrames}
            </span>
            <span className="text-blue-400 font-medium">
              Running: {job.runningFrames}
            </span>
            <span className="text-amber-400 font-medium">Pending: {job.pendingFrames}</span>
            <span className="text-red-400 font-medium">Dead: {job.deadFrames}</span>
            <span className="ml-auto text-text-primary font-semibold">Total: {job.totalFrames}</span>
          </div>

          {/* Integrated Log Viewer Panel - bottom, resizable */}
          {activeFrame && (
            <div
              className={cn(
                "border-t border-neutral-200 dark:border-white/8 flex flex-col shrink-0",
                logPanelCollapsed && "h-9"
              )}
              style={logPanelCollapsed ? undefined : { height: logPanelHeight }}
            >
              {/* Drag Handle */}
              {!logPanelCollapsed && (
                <div
                  className="h-1.5 cursor-row-resize bg-transparent hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors shrink-0 group flex items-center justify-center"
                  onMouseDown={handleDragStart}
                >
                  <div className="w-8 h-0.5 rounded-full bg-neutral-300 dark:bg-white/10 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
                </div>
              )}
              {/* Log Panel Header */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-50/80 dark:bg-white/3 border-b border-neutral-200/60 dark:border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setLogPanelCollapsed(!logPanelCollapsed)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    {logPanelCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <span className="text-xs font-medium text-text-primary">
                    Frame {activeFrame.number} Log
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      frameStateColors[activeFrame.state] || "bg-surface-muted text-text-muted"
                    )}
                  >
                    {activeFrame.state}
                  </Badge>
                  <span className="text-[10px] text-text-muted font-mono">
                    Host: {resolveHost(activeFrame.lastResource)}
                  </span>
                  <span className={cn("text-[10px] font-mono", getExitCodeColorClass(activeFrame.exitStatus))}>
                    Exit: {getExitCodeLabel(activeFrame.exitStatus)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={autoScroll ? "default" : "outline"}
                    size="default"
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={cn(
                      "h-6 px-2 text-[10px] rounded-md",
                      autoScroll && "bg-emerald-500 hover:bg-emerald-600 text-white"
                    )}
                  >
                    <ArrowDown className="h-2.5 w-2.5 mr-0.5" />
                    Auto-scroll
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleDownloadLog}
                    disabled={!logs}
                    className="h-6 px-2 text-[10px] rounded-md border-neutral-200 dark:border-white/10"
                  >
                    <Download className="h-2.5 w-2.5 mr-0.5" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={fetchLogs}
                    disabled={logsLoading}
                    className="h-6 px-2 text-[10px] rounded-md border-neutral-200 dark:border-white/10"
                  >
                    <RefreshCw className={cn("h-2.5 w-2.5 mr-0.5", logsLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Log Content */}
              {!logPanelCollapsed && (
                <div className="flex-1 min-h-0 overflow-y-auto" ref={logScrollRef}>
                  <div className="p-3 font-mono text-xs leading-relaxed bg-neutral-950 dark:bg-black/40 min-h-full">
                    {logsLoading ? (
                      <div className="text-neutral-500 animate-pulse py-8 text-center">Loading logs...</div>
                    ) : logs ? (
                      logs.split("\n").map((line, i) => (
                        <div key={`log-${i}-${line.slice(0, 16)}`} className={cn("whitespace-pre-wrap", getLogLineColor(line))}>
                          {line || "\u00A0"}
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-500 py-8 text-center">
                        Select a frame to view its render log
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No frame selected prompt */}
          {!activeFrame && frames.length > 0 && !loading && (
            <div className="border-t border-neutral-200 dark:border-white/8 px-5 py-3 text-center shrink-0 bg-neutral-50/50 dark:bg-white/2">
              <span className="text-xs text-text-muted">
                Click on a frame row to view its render preview and log
              </span>
            </div>
          )}
          </div>{/* end left column */}

          {/* Right column: Frame Preview Panel */}
          {activeFrame && (
            <div className="w-[480px] shrink-0 border-l border-neutral-200 dark:border-white/8 flex flex-col bg-neutral-50/30 dark:bg-white/2 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-neutral-200/60 dark:border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">
                    Frame {activeFrame.number} Preview
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 ml-auto",
                      frameStateColors[activeFrame.state] || "bg-surface-muted text-text-muted"
                    )}
                  >
                    {activeFrame.state}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 min-h-0">
                {previewLoading ? (
                  <div className="text-xs text-text-muted animate-pulse">
                    Loading preview…
                  </div>
                ) : previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={`Frame ${activeFrame.number} render output`}
                    className="max-w-full max-h-full object-contain rounded"
                    onError={() => {
                      setPreviewUrl(null);
                      setPreviewError("Failed to load image");
                    }}
                  />
                ) : (
                  <div className="text-xs text-text-muted text-center flex flex-col items-center gap-2 px-4">
                    <ImageIcon className="h-8 w-8 opacity-20" />
                    <span>{previewError || "No preview available"}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>{/* end horizontal split */}
      </DialogContent>
    </Dialog>
  );
}
