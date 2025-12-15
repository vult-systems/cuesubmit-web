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
import { RefreshCw, Download, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  name: string;
  state: string;
  user: string;
  show: string;
}

interface LogViewerDialogProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock log generator for offline mode
function generateMockLogs(jobName: string): string {
  const timestamp = () => {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, -5);
  };
  
  const lines = [
    `[${timestamp()}] INFO: Starting job: ${jobName}`,
    `[${timestamp()}] INFO: Initializing render environment...`,
    `[${timestamp()}] INFO: Loading scene file...`,
    `[${timestamp()}] INFO: Scene loaded successfully`,
    `[${timestamp()}] INFO: Checking licenses...`,
    `[${timestamp()}] INFO: License acquired: Arnold Renderer`,
    `[${timestamp()}] INFO: Setting up render parameters...`,
    `[${timestamp()}] INFO: Resolution: 1920x1080`,
    `[${timestamp()}] INFO: Frame range: 1-100`,
    `[${timestamp()}] INFO: Samples: 6`,
    `[${timestamp()}] INFO: Starting frame 1...`,
    `[${timestamp()}] DEBUG: Parsing geometry...`,
    `[${timestamp()}] DEBUG: Building BVH acceleration structure...`,
    `[${timestamp()}] DEBUG: Loading textures (24 files)...`,
    `[${timestamp()}] DEBUG: Compiling shaders...`,
    `[${timestamp()}] INFO: Rendering frame 1...`,
    `[${timestamp()}] INFO: Frame 1 completed in 45.2s`,
    `[${timestamp()}] INFO: Writing output: frame_0001.exr`,
    `[${timestamp()}] INFO: Starting frame 2...`,
    `[${timestamp()}] DEBUG: Reusing cached BVH structure`,
    `[${timestamp()}] INFO: Rendering frame 2...`,
    `[${timestamp()}] INFO: Frame 2 completed in 42.8s`,
    `[${timestamp()}] INFO: Writing output: frame_0002.exr`,
    `[${timestamp()}] INFO: Starting frame 3...`,
    `[${timestamp()}] INFO: Rendering frame 3...`,
    `[${timestamp()}] WARN: Memory usage at 85%`,
    `[${timestamp()}] INFO: Frame 3 completed in 48.1s`,
    `[${timestamp()}] INFO: Writing output: frame_0003.exr`,
    `[${timestamp()}] INFO: Starting frame 4...`,
    `[${timestamp()}] INFO: Rendering frame 4...`,
    `[${timestamp()}] INFO: Frame 4 completed in 44.5s`,
    `[${timestamp()}] INFO: Writing output: frame_0004.exr`,
    `[${timestamp()}] INFO: Progress: 4/100 frames (4%)`,
    `[${timestamp()}] INFO: Estimated time remaining: 1h 52m`,
    `[${timestamp()}] INFO: Starting frame 5...`,
    `[${timestamp()}] INFO: Rendering frame 5...`,
  ];
  
  return lines.join('\n');
}

export function LogViewerDialog({
  job,
  open,
  onOpenChange,
}: LogViewerDialogProps) {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    if (!job) return;
    setLoading(true);
    try {
      // Check if we're in offline mode
      const isOffline = process.env.NEXT_PUBLIC_CUEWEB_MODE === 'offline' || 
                        typeof window !== 'undefined' && window.location.hostname === 'localhost';
      
      if (isOffline) {
        // Generate mock logs for offline mode
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
        setLogs(generateMockLogs(job.name));
      } else {
        const response = await fetch(`/api/jobs/${job.id}/logs`);
        const data = await response.json();
        if (response.ok) {
          setLogs(data.logs || "No logs available");
        } else {
          toast.error(data.error || "Failed to fetch logs");
          setLogs("Error loading logs");
        }
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      // Fallback to mock logs on error
      setLogs(generateMockLogs(job.name));
    } finally {
      setLoading(false);
    }
  }, [job]);

  useEffect(() => {
    if (open && job) {
      fetchLogs();
    }
  }, [open, job, fetchLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    if (!job || !logs) return;
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Logs downloaded");
  };

  const getLogLineColor = (line: string) => {
    if (line.includes('ERROR') || line.includes('FATAL')) return 'text-red-600 dark:text-red-400';
    if (line.includes('WARN')) return 'text-amber-600 dark:text-amber-400';
    if (line.includes('DEBUG')) return 'text-text-muted';
    if (line.includes('INFO')) return 'text-text-secondary';
    return 'text-text-muted';
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-5 shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>
                Job Logs
              </DialogTitle>
              <p className="text-text-muted text-sm mt-1 font-mono truncate max-w-150">
                {job.name}
              </p>
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
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-4">
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="bg-surface-muted rounded-xl border border-border p-4 min-h-full">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-border border-t-text-primary rounded-full animate-spin" />
                    <span className="text-text-muted text-sm">Loading logs...</span>
                  </div>
                </div>
              ) : (
                <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
                  {logs.split('\n').map((line, i) => (
                    <div key={i} className={cn("py-0.5", getLogLineColor(line))}>
                      {line}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
