"use client";

import { useState, useEffect, useCallback } from "react";
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
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { iconButton } from "@/lib/icon-button-styles";
import { FrameLogDialog } from "@/components/frame-log-dialog";

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

export function JobDetailDrawer({
  job,
  open,
  onOpenChange,
  onJobUpdated,
}: JobDetailDrawerProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedFrameForLog, setSelectedFrameForLog] = useState<Frame | null>(null);

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
    }
  }, [open, job, fetchFrames]);

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

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[98vw] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="border-b border-neutral-200 dark:border-white/8 px-5 py-4 shrink-0">
          <DialogTitle className="text-text-primary text-lg font-semibold pr-8">
            {job.name}
          </DialogTitle>
          <div className="flex items-center gap-6 text-sm text-text-muted mt-2">
            <span>User: <span className="text-text-secondary">{job.user}</span></span>
            <span>Show: <span className="text-text-secondary">{job.show}</span></span>
            <span>Priority: <span className="text-text-secondary">{job.priority}</span></span>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3 flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Job Actions */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction(job.isPaused ? "resume" : "pause")}
              disabled={actionLoading}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-8 px-3 text-sm rounded-lg"
            >
              {job.isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction("retry")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-8 px-3 text-sm rounded-lg"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retry All Dead ({deadFrames.length})
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => handleJobAction("eat")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-8 px-3 text-sm rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Eat All Dead
            </Button>
            <Button
              variant="destructive"
              size="default"
              onClick={() => handleJobAction("kill")}
              disabled={actionLoading}
              className="h-8 px-3 text-sm rounded-lg"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" /> Kill Job
            </Button>
          </div>

          {/* Selection Actions */}
          {selectedFrames.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <span className="text-sm text-text-primary font-medium">
                {selectedFrames.size} frame(s) selected
              </span>
              <Button
                variant="outline"
                size="default"
                onClick={() =>
                  handleJobAction("retry", Array.from(selectedFrames))
                }
                disabled={actionLoading || selectedDeadFrames.length === 0}
                className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-7 px-2.5 text-xs rounded-md"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Retry Selected
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() =>
                  handleJobAction("eat", Array.from(selectedFrames))
                }
                disabled={actionLoading || selectedDeadFrames.length === 0}
                className="border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 hover:bg-neutral-50 dark:hover:bg-white/6 text-text-primary h-7 px-2.5 text-xs rounded-md"
              >
                <Trash2 className="h-3 w-3 mr-1" /> Eat Selected
              </Button>
              <Button
                variant="ghost"
                size="default"
                onClick={clearSelection}
                className="text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 h-7 px-2.5 text-xs rounded-md"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Quick Select */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="default"
              onClick={selectAllDead}
              disabled={deadFrames.length === 0}
              className="text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 h-7 px-2.5 text-xs rounded-md"
            >
              <CheckSquare className="h-3 w-3 mr-1" /> Select Dead
            </Button>
            <Button
              variant="ghost"
              size="default"
              onClick={clearSelection}
              disabled={selectedFrames.size === 0}
              className="text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 h-7 px-2.5 text-xs rounded-md"
            >
              <Square className="h-3 w-3 mr-1" /> Clear All
            </Button>
            <Button
              variant="ghost"
              size="default"
              onClick={fetchFrames}
              disabled={loading}
              className="text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 ml-auto h-7 px-2.5 text-xs rounded-md"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Frames Table */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="rounded-lg border border-neutral-200/80 dark:border-white/6 bg-white/60 dark:bg-white/2">
              <Table>
                <TableHeader>
                  <TableRow className="border-neutral-200 dark:border-white/6 hover:bg-transparent">
                    <TableHead className="w-10 text-text-muted py-2 text-xs"></TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Frame</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Chunk</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">State</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Retries</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Exit</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Host</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Start</TableHead>
                    <TableHead className="text-text-muted py-2 text-xs">Stop</TableHead>
                    <TableHead className="w-10 text-text-muted py-2 text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="h-32 text-center text-text-muted"
                      >
                        Loading frames...
                      </TableCell>
                    </TableRow>
                  ) : frames.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="h-32 text-center text-text-muted"
                      >
                        No frames found
                      </TableCell>
                    </TableRow>
                  ) : (
                    frames.map((frame) => (
                      <TableRow
                        key={frame.id}
                        className={cn(
                          "border-neutral-200 dark:border-white/6 hover:bg-neutral-50 dark:hover:bg-white/3",
                          selectedFrames.has(frame.id) && "bg-blue-500/10"
                        )}
                      >
                        <TableCell className="py-1.5">
                          <Checkbox
                            checked={selectedFrames.has(frame.id)}
                            onCheckedChange={() => toggleFrame(frame.id)}
                            disabled={frame.state !== "DEAD"}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-text-primary py-1.5 text-sm">
                          {frame.number}
                        </TableCell>
                        <TableCell className="text-text-muted py-1.5 font-mono text-xs">
                          {frame.chunkNumber || "-"}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              frameStateColors[frame.state] ||
                                "bg-surface-muted text-text-muted"
                            )}
                          >
                            {frame.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-text-muted py-1.5 text-sm">
                          {frame.retryCount}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-1.5 text-sm",
                            frame.exitStatus !== 0
                              ? "text-red-400"
                              : "text-text-muted"
                          )}
                        >
                          {frame.exitStatus}
                        </TableCell>
                        <TableCell className="text-text-muted truncate max-w-50 py-1.5 text-sm">
                          {frame.lastResource || "-"}
                        </TableCell>
                        <TableCell className="text-text-muted py-1.5 text-sm">
                          {formatTime(frame.startTime)}
                        </TableCell>
                        <TableCell className="text-text-muted py-1.5 text-sm">
                          {formatTime(frame.stopTime)}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {(frame.state === "SUCCEEDED" || frame.state === "DEAD" || frame.state === "RUNNING") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={iconButton.logsSmall}
                              onClick={() => setSelectedFrameForLog(frame)}
                              title="View frame log"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

          {/* Frame Summary */}
          <div className="flex items-center gap-4 text-xs border-t border-neutral-200 dark:border-white/8 pt-3 shrink-0">
            <span className="text-emerald-400 font-medium">
              Succeeded: {job.succeededFrames}
            </span>
            <span className="text-blue-400 font-medium">
              Running: {job.runningFrames}
            </span>
            <span className="text-amber-400 font-medium">Pending: {job.pendingFrames}</span>
            <span className="text-red-400 font-medium">Dead: {job.deadFrames}</span>
            <span className="ml-auto text-text-primary font-semibold">Total: {job.totalFrames}</span>
          </div>
        </div>
      </DialogContent>

      {/* Frame Log Dialog */}
      <FrameLogDialog
        frame={selectedFrameForLog}
        jobName={job.name}
        open={selectedFrameForLog !== null}
        onOpenChange={(open) => !open && setSelectedFrameForLog(null)}
      />
    </Dialog>
  );
}
