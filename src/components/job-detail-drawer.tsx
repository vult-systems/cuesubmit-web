"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  RUNNING: "bg-section-cool-bg text-section-cool border-section-cool-border",
  SUCCEEDED: "bg-success-muted text-success border-success/30",
  DEAD: "bg-danger-muted text-danger border-danger/30",
  DEPEND: "bg-warning-muted text-warning border-warning/30",
  EATEN: "bg-surface-muted text-text-muted border-border",
  CHECKPOINT: "bg-section-cool-bg text-section-cool border-section-cool-border",
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:max-w-[800px] bg-surface border-border">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-text-primary text-lg font-semibold">
            {job.name}
          </SheetTitle>
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span>User: {job.user}</span>
            <span>Show: {job.show}</span>
            <span>Priority: {job.priority}</span>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Job Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleJobAction(job.isPaused ? "resume" : "pause")}
              disabled={actionLoading}
              className="border-border"
            >
              {job.isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-1" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-1" /> Pause
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleJobAction("retry")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-border"
            >
              <RotateCcw className="h-4 w-4 mr-1" /> Retry All Dead ({deadFrames.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleJobAction("eat")}
              disabled={actionLoading || deadFrames.length === 0}
              className="border-border"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eat All Dead
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleJobAction("kill")}
              disabled={actionLoading}
            >
              <XCircle className="h-4 w-4 mr-1" /> Kill Job
            </Button>
          </div>

          {/* Selection Actions */}
          {selectedFrames.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-section-cool-bg rounded border border-section-cool-border">
              <span className="text-sm text-text-primary">
                {selectedFrames.size} frame(s) selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleJobAction("retry", Array.from(selectedFrames))
                }
                disabled={actionLoading || selectedDeadFrames.length === 0}
                className="border-border"
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Retry Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleJobAction("eat", Array.from(selectedFrames))
                }
                disabled={actionLoading || selectedDeadFrames.length === 0}
                className="border-border"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Eat Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-text-muted"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Quick Select */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAllDead}
              disabled={deadFrames.length === 0}
              className="text-text-muted"
            >
              <CheckSquare className="h-4 w-4 mr-1" /> Select Dead
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={selectedFrames.size === 0}
              className="text-text-muted"
            >
              <Square className="h-4 w-4 mr-1" /> Clear All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchFrames}
              disabled={loading}
              className="text-text-muted ml-auto"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Frames Table */}
          <ScrollArea className="h-[calc(100vh-350px)]">
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 text-text-muted"></TableHead>
                    <TableHead className="text-text-muted">Frame</TableHead>
                    <TableHead className="text-text-muted">State</TableHead>
                    <TableHead className="text-text-muted">Retries</TableHead>
                    <TableHead className="text-text-muted">Exit</TableHead>
                    <TableHead className="text-text-muted">Host</TableHead>
                    <TableHead className="text-text-muted">Start</TableHead>
                    <TableHead className="text-text-muted">Stop</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-24 text-center text-text-muted"
                      >
                        Loading frames...
                      </TableCell>
                    </TableRow>
                  ) : frames.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-24 text-center text-text-muted"
                      >
                        No frames found
                      </TableCell>
                    </TableRow>
                  ) : (
                    frames.map((frame) => (
                      <TableRow
                        key={frame.id}
                        className={cn(
                          "border-border hover:bg-surface-muted/50",
                          selectedFrames.has(frame.id) && "bg-section-cool-bg/50"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedFrames.has(frame.id)}
                            onCheckedChange={() => toggleFrame(frame.id)}
                            disabled={frame.state !== "DEAD"}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-text-primary">
                          {frame.number}
                        </TableCell>
                        <TableCell>
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
                        <TableCell className="text-text-muted">
                          {frame.retryCount}
                        </TableCell>
                        <TableCell
                          className={cn(
                            frame.exitStatus !== 0
                              ? "text-danger"
                              : "text-text-muted"
                          )}
                        >
                          {frame.exitStatus}
                        </TableCell>
                        <TableCell className="text-text-muted truncate max-w-[150px]">
                          {frame.lastResource || "-"}
                        </TableCell>
                        <TableCell className="text-text-muted">
                          {formatTime(frame.startTime)}
                        </TableCell>
                        <TableCell className="text-text-muted">
                          {formatTime(frame.stopTime)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

          {/* Frame Summary */}
          <div className="flex items-center gap-4 text-sm text-text-muted border-t border-border pt-4">
            <span className="text-success">
              Succeeded: {job.succeededFrames}
            </span>
            <span className="text-section-cool">
              Running: {job.runningFrames}
            </span>
            <span className="text-warning">Pending: {job.pendingFrames}</span>
            <span className="text-danger">Dead: {job.deadFrames}</span>
            <span className="ml-auto">Total: {job.totalFrames}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
