"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getExitCodeLabel, getExitCodeColorClass, getExitCodeInfo } from "@/lib/exit-codes";

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

interface FrameLogDialogProps {
  frame: Frame | null;
  jobId: string;
  jobName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Generate mock render log for a specific frame
function generateFrameLog(frame: Frame, jobName: string): string {
  const formatTime = (ts: number) => {
    if (!ts) return "N/A";
    return new Date(ts).toISOString().replace('T', ' ').slice(0, -5);
  };

  const host = frame.lastResource || "unknown-host";
  const [hostName, cores] = host.split("/");
  const coreCount = cores ? parseFloat(cores) : 1;
  
  const duration = frame.stopTime && frame.startTime 
    ? ((frame.stopTime - frame.startTime) / 1000).toFixed(1) 
    : "N/A";

  const lines: string[] = [];
  
  const exitInfo = getExitCodeInfo(frame.exitStatus);
  
  // Header info
  lines.push(`================================================================================`);
  lines.push(`OpenCue Frame Log`);
  lines.push(`================================================================================`);
  lines.push(`Job:         ${jobName}`);
  lines.push(`Frame:       ${frame.number} (${frame.name})`);
  lines.push(`Chunk:       ${frame.chunkNumber || 'N/A'} (size: ${frame.chunkSize || 'N/A'})`);
  lines.push(`Host:        ${hostName}`);
  lines.push(`Cores:       ${coreCount}`);
  lines.push(`Start Time:  ${formatTime(frame.startTime)}`);
  lines.push(`Stop Time:   ${formatTime(frame.stopTime)}`);
  lines.push(`Duration:    ${duration}s`);
  lines.push(`Exit Status: ${frame.exitStatus} (${exitInfo.label} - ${exitInfo.description})`);
  lines.push(`Retries:     ${frame.retryCount}`);
  lines.push(`================================================================================`);
  lines.push(``);

  // Simulated render log
  const startTime = frame.startTime || Date.now() - 60000;
  const addLogLine = (offset: number, level: string, message: string) => {
    const ts = new Date(startTime + offset).toISOString().replace('T', ' ').slice(0, -5);
    lines.push(`[${ts}] ${level}: ${message}`);
  };

  addLogLine(0, "INFO", `Frame ${frame.number} started on ${hostName}`);
  addLogLine(100, "INFO", `Allocated ${coreCount} cores for rendering`);
  addLogLine(200, "INFO", `Loading scene data...`);
  addLogLine(500, "INFO", `Scene loaded successfully`);
  addLogLine(700, "INFO", `Initializing renderer (Arnold 7.2.1)`);
  addLogLine(900, "DEBUG", `Setting thread count to ${Math.floor(coreCount)}`);
  addLogLine(1000, "INFO", `Loading textures...`);
  addLogLine(1500, "DEBUG", `Loaded 156 textures (2.4 GB)`);
  addLogLine(1700, "INFO", `Building acceleration structures...`);
  addLogLine(2500, "DEBUG", `BVH build complete (0.8s)`);
  addLogLine(2700, "INFO", `Starting render...`);
  addLogLine(3000, "DEBUG", `Bucket size: 64x64`);
  addLogLine(3200, "DEBUG", `Camera samples: 6`);
  addLogLine(3500, "DEBUG", `Diffuse samples: 3`);
  addLogLine(3800, "DEBUG", `Specular samples: 3`);

  // Add progress updates
  const renderDuration = (frame.stopTime && frame.startTime) 
    ? (frame.stopTime - frame.startTime) 
    : 45000;
  
  for (let progress = 10; progress <= 100; progress += 10) {
    const offset = 4000 + (progress / 100) * (renderDuration - 5000);
    addLogLine(offset, "INFO", `Render progress: ${progress}%`);
    
    if (progress === 50) {
      addLogLine(offset + 50, "DEBUG", `Peak memory usage: ${(Math.random() * 8 + 4).toFixed(1)} GB`);
    }
    if (progress === 80 && Math.random() > 0.7) {
      addLogLine(offset + 50, "WARN", `Memory usage high: ${(Math.random() * 2 + 10).toFixed(1)} GB`);
    }
  }

  if (frame.state === "SUCCEEDED") {
    addLogLine(renderDuration - 500, "INFO", `Render complete`);
    addLogLine(renderDuration - 300, "INFO", `Writing output: frame_${String(frame.number).padStart(4, '0')}.exr`);
    addLogLine(renderDuration - 100, "INFO", `Output written successfully`);
    addLogLine(renderDuration, "INFO", `Frame ${frame.number} completed in ${duration}s`);
    addLogLine(renderDuration + 50, "INFO", `Exit code: 0`);
  } else if (frame.state === "DEAD") {
    addLogLine(renderDuration - 1000, "ERROR", `Render failed at ${Math.floor(Math.random() * 40 + 50)}%`);
    if (Math.random() > 0.5) {
      addLogLine(renderDuration - 800, "ERROR", `Out of memory: requested 16.2 GB, available 12.0 GB`);
    } else {
      addLogLine(renderDuration - 800, "ERROR", `License server connection lost`);
    }
    addLogLine(renderDuration - 500, "ERROR", `Fatal error, aborting render`);
    addLogLine(renderDuration, "ERROR", `Frame ${frame.number} failed after ${frame.retryCount} retries`);
    addLogLine(renderDuration + 50, "INFO", `Exit code: ${frame.exitStatus}`);
  } else if (frame.state === "RUNNING") {
    const elapsed = Date.now() - frame.startTime;
    const progress = Math.min(95, Math.floor((elapsed / 60000) * 50));
    addLogLine(elapsed - 1000, "INFO", `Render in progress: ~${progress}%`);
    lines.push(``);
    lines.push(`[LIVE] Frame is currently rendering...`);
  }

  lines.push(``);
  lines.push(`================================================================================`);
  lines.push(`End of log`);
  lines.push(`================================================================================`);

  return lines.join('\n');
}

const stateColors: Record<string, string> = {
  WAITING: "bg-surface-muted text-text-muted border-border",
  RUNNING: "bg-blue-500/15 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
  SUCCEEDED: "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/20",
  DEAD: "bg-red-500/15 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 dark:border-red-500/20",
};

export function FrameLogDialog({
  frame,
  jobId,
  jobName,
  open,
  onOpenChange,
}: FrameLogDialogProps) {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    if (!frame) return;
    setLoading(true);
    try {
      // Try to fetch real logs from the API
      const response = await fetch(
        `/api/jobs/${jobId}/logs?frame=${frame.number}&layer=render`
      );
      const data = await response.json();
      
      if (response.ok && data.logs && !data.error) {
        setLogs(data.logs);
        } else {
        // Fall back to mock logs if API fails or returns empty
        console.log("Using mock logs:", data.error || "No logs returned");
        setLogs(generateFrameLog(frame, jobName));
      }
    } catch (error) {
      console.error("Failed to fetch frame logs:", error);
      // Fall back to mock logs on error
      setLogs(generateFrameLog(frame, jobName));
    } finally {
      setLoading(false);
    }
  }, [frame, jobId, jobName]);

  useEffect(() => {
    if (open && frame) {
      fetchLogs();
    }
  }, [open, frame, fetchLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    if (!frame || !logs) return;
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobName.replace(/[^a-z0-9]/gi, '_')}_frame_${frame.number}_log.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log downloaded");
  };

  const getLogLineColor = (line: string) => {
    if (line.includes('ERROR') || line.includes('FATAL')) return 'text-red-600 dark:text-red-400';
    if (line.includes('WARN')) return 'text-amber-600 dark:text-amber-400';
    if (line.includes('DEBUG')) return 'text-text-muted';
    if (line.includes('INFO')) return 'text-text-secondary';
    if (line.includes('[LIVE]')) return 'text-blue-600 dark:text-blue-400 animate-pulse';
    if (line.startsWith('===')) return 'text-text-muted opacity-50';
    return 'text-text-muted';
  };

  if (!frame) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DialogTitle className="text-xl font-semibold text-text-primary">
                Frame {frame.number} Log
              </DialogTitle>
              <Badge
                variant="outline"
                className={cn(
                  stateColors[frame.state] || "bg-surface-muted text-text-muted"
                )}
              >
                {frame.state}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={autoScroll ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  "h-9 px-3",
                  autoScroll && "bg-emerald-500 hover:bg-emerald-600 text-white"
                )}
              >
                <ArrowDown className="h-4 w-4 mr-2" />
                Auto-scroll
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!logs}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-muted mt-3">
            <span>Host: <span className="text-text-secondary font-mono">{frame.lastResource || "-"}</span></span>
            <span>Chunk: <span className="text-text-secondary font-mono">{frame.chunkNumber || "-"}</span></span>
            <span>Exit: <span className={cn("font-mono", getExitCodeColorClass(frame.exitStatus))} title={`Exit code: ${frame.exitStatus}`}>{getExitCodeLabel(frame.exitStatus)}</span></span>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="p-4 font-mono text-sm leading-relaxed bg-surface-muted rounded-lg">
            {loading ? (
              <div className="text-text-muted animate-pulse">Loading logs...</div>
            ) : (
              logs.split('\n').map((line, i) => (
                <div key={i} className={cn("whitespace-pre-wrap", getLogLineColor(line))}>
                  {line || '\u00A0'}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
