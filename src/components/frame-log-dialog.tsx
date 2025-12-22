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

// Helper functions for log generation
function formatLogTime(ts: number): string {
  if (!ts) return "N/A";
  return new Date(ts).toISOString().replace('T', ' ').slice(0, -5);
}

function createLogLine(startTime: number, offset: number, level: string, message: string): string {
  const ts = new Date(startTime + offset).toISOString().replace('T', ' ').slice(0, -5);
  return `[${ts}] ${level}: ${message}`;
}

function generateLogHeader(frame: Frame, jobName: string, hostName: string, coreCount: number, duration: string): string[] {
  const exitInfo = getExitCodeInfo(frame.exitStatus);
  const separator = `================================================================================`;
  
  return [
    separator,
    `OpenCue Frame Log`,
    separator,
    `Job:         ${jobName}`,
    `Frame:       ${frame.number} (${frame.name})`,
    `Chunk:       ${frame.chunkNumber || 'N/A'} (size: ${frame.chunkSize || 'N/A'})`,
    `Host:        ${hostName}`,
    `Cores:       ${coreCount}`,
    `Start Time:  ${formatLogTime(frame.startTime)}`,
    `Stop Time:   ${formatLogTime(frame.stopTime)}`,
    `Duration:    ${duration}s`,
    `Exit Status: ${frame.exitStatus} (${exitInfo.label} - ${exitInfo.description})`,
    `Retries:     ${frame.retryCount}`,
    separator,
    ``,
  ];
}

function generateInitLogs(startTime: number, frameNumber: number, hostName: string, coreCount: number): string[] {
  return [
    createLogLine(startTime, 0, "INFO", `Frame ${frameNumber} started on ${hostName}`),
    createLogLine(startTime, 100, "INFO", `Allocated ${coreCount} cores for rendering`),
    createLogLine(startTime, 200, "INFO", `Loading scene data...`),
    createLogLine(startTime, 500, "INFO", `Scene loaded successfully`),
    createLogLine(startTime, 700, "INFO", `Initializing renderer (Arnold 7.2.1)`),
    createLogLine(startTime, 900, "DEBUG", `Setting thread count to ${Math.floor(coreCount)}`),
    createLogLine(startTime, 1000, "INFO", `Loading textures...`),
    createLogLine(startTime, 1500, "DEBUG", `Loaded 156 textures (2.4 GB)`),
    createLogLine(startTime, 1700, "INFO", `Building acceleration structures...`),
    createLogLine(startTime, 2500, "DEBUG", `BVH build complete (0.8s)`),
    createLogLine(startTime, 2700, "INFO", `Starting render...`),
    createLogLine(startTime, 3000, "DEBUG", `Bucket size: 64x64`),
    createLogLine(startTime, 3200, "DEBUG", `Camera samples: 6`),
    createLogLine(startTime, 3500, "DEBUG", `Diffuse samples: 3`),
    createLogLine(startTime, 3800, "DEBUG", `Specular samples: 3`),
  ];
}

function generateProgressLogs(startTime: number, renderDuration: number): string[] {
  const logs: string[] = [];
  for (let progress = 10; progress <= 100; progress += 10) {
    const offset = 4000 + (progress / 100) * (renderDuration - 5000);
    logs.push(createLogLine(startTime, offset, "INFO", `Render progress: ${progress}%`));
    
    if (progress === 50) {
      logs.push(createLogLine(startTime, offset + 50, "DEBUG", `Peak memory usage: ${(Math.random() * 8 + 4).toFixed(1)} GB`));
    }
    if (progress === 80 && Math.random() > 0.7) {
      logs.push(createLogLine(startTime, offset + 50, "WARN", `Memory usage high: ${(Math.random() * 2 + 10).toFixed(1)} GB`));
    }
  }
  return logs;
}

function generateStateLogs(frame: Frame, startTime: number, renderDuration: number, duration: string): string[] {
  const logs: string[] = [];
  
  if (frame.state === "SUCCEEDED") {
    logs.push(
      createLogLine(startTime, renderDuration - 500, "INFO", `Render complete`),
      createLogLine(startTime, renderDuration - 300, "INFO", `Writing output: frame_${String(frame.number).padStart(4, '0')}.exr`),
      createLogLine(startTime, renderDuration - 100, "INFO", `Output written successfully`),
      createLogLine(startTime, renderDuration, "INFO", `Frame ${frame.number} completed in ${duration}s`),
      createLogLine(startTime, renderDuration + 50, "INFO", `Exit code: 0`)
    );
  } else if (frame.state === "DEAD") {
    logs.push(createLogLine(startTime, renderDuration - 1000, "ERROR", `Render failed at ${Math.floor(Math.random() * 40 + 50)}%`));
    const errorMsg = Math.random() > 0.5 
      ? `Out of memory: requested 16.2 GB, available 12.0 GB`
      : `License server connection lost`;
    logs.push(
      createLogLine(startTime, renderDuration - 800, "ERROR", errorMsg),
      createLogLine(startTime, renderDuration - 500, "ERROR", `Fatal error, aborting render`),
      createLogLine(startTime, renderDuration, "ERROR", `Frame ${frame.number} failed after ${frame.retryCount} retries`),
      createLogLine(startTime, renderDuration + 50, "INFO", `Exit code: ${frame.exitStatus}`)
    );
  } else if (frame.state === "RUNNING") {
    const elapsed = Date.now() - frame.startTime;
    const progress = Math.min(95, Math.floor((elapsed / 60000) * 50));
    logs.push(
      createLogLine(startTime, elapsed - 1000, "INFO", `Render in progress: ~${progress}%`),
      ``,
      `[LIVE] Frame is currently rendering...`
    );
  }
  
  return logs;
}

// Generate mock render log for a specific frame
function generateFrameLog(frame: Frame, jobName: string): string {
  const host = frame.lastResource || "unknown-host";
  const [hostName, cores] = host.split("/");
  const coreCount = cores ? Number.parseFloat(cores) : 1;
  
  const duration = frame.stopTime && frame.startTime 
    ? ((frame.stopTime - frame.startTime) / 1000).toFixed(1) 
    : "N/A";

  const startTime = frame.startTime || Date.now() - 60000;
  const renderDuration = (frame.stopTime && frame.startTime) 
    ? (frame.stopTime - frame.startTime) 
    : 45000;

  const separator = `================================================================================`;
  const lines = [
    ...generateLogHeader(frame, jobName, hostName, coreCount, duration),
    ...generateInitLogs(startTime, frame.number, hostName, coreCount),
    ...generateProgressLogs(startTime, renderDuration),
    ...generateStateLogs(frame, startTime, renderDuration, duration),
    ``,
    separator,
    `End of log`,
    separator,
  ];

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
}: Readonly<FrameLogDialogProps>) {
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
    a.download = `${jobName.replaceAll(/[^a-z0-9]/gi, '_')}_frame_${frame.number}_log.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
                <div key={`log-${i}-${line.slice(0, 20)}`} className={cn("whitespace-pre-wrap", getLogLineColor(line))}>
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
