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

interface FrameLogDialogProps {
  frame: Frame | null;
  jobId: string;
  jobName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      const response = await fetch(
        `/api/jobs/${jobId}/logs?frame=${frame.number}&layer=render`
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
      setLoading(false);
    }
  }, [frame, jobId]);

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
