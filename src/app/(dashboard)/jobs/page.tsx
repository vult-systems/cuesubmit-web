"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Pause,
  Play,
  XCircle,
  RotateCcw,
  Search,
  Trash2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { iconButton } from "@/lib/icon-button-styles";
import { JobDetailDrawer } from "@/components/job-detail-drawer";
import { LogViewerDialog } from "@/components/log-viewer-dialog";
import { accentColorList } from "@/lib/accent-colors";
import { GroupedSection } from "@/components/grouped-section";

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
  eatenFrames?: number;
  waitingFrames?: number;
  dependFrames?: number;
  totalFrames: number;
  logDir?: string;
}

const stateColors: Record<string, string> = {
  PENDING: "bg-warning/15 dark:bg-warning/10 text-warning border-warning/30 dark:border-warning/20",
  RUNNING: "bg-blue-500/15 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
  FINISHED: "bg-success/15 dark:bg-success/10 text-success border-success/30 dark:border-success/20",
  DEAD: "bg-danger/15 dark:bg-danger/10 text-danger border-danger/30 dark:border-danger/20",
  PAUSED: "bg-surface-muted text-text-muted border-border",
};

function ProgressBar({ job }: Readonly<{ job: Job }>) {
  const total = job.totalFrames || 1;
  // Eaten frames count as completed (shown in gray/muted), succeeded in green
  const eaten = ((job.eatenFrames || 0) / total) * 100;
  const succeeded = (job.succeededFrames / total) * 100;
  const running = (job.runningFrames / total) * 100;
  const dead = (job.deadFrames / total) * 100;
  
  // Total completed = succeeded + eaten
  const completedFrames = job.succeededFrames + (job.eatenFrames || 0);

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 h-1.5 bg-surface-muted rounded-full overflow-hidden flex">
        <div className="bg-success transition-all duration-500" style={{ width: `${succeeded}%` }} />
        <div className="bg-gray-400 transition-all duration-500" style={{ width: `${eaten}%` }} title="Eaten frames" />
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${running}%` }} />
        <div className="bg-danger transition-all duration-500" style={{ width: `${dead}%` }} />
      </div>
      <span className="text-xs text-text-muted">
        {completedFrames}/{job.totalFrames}
      </span>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logJob, setLogJob] = useState<Job | null>(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  // Group jobs by show
  const jobsByShow = useMemo(() => {
    const filtered = globalFilter
      ? jobs.filter(job =>
          job.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
          job.user.toLowerCase().includes(globalFilter.toLowerCase()) ||
          job.show.toLowerCase().includes(globalFilter.toLowerCase())
        )
      : jobs;
    
    const grouped = filtered.reduce((acc, job) => {
      const show = job.show || "Unknown";
      if (!acc[show]) acc[show] = [];
      acc[show].push(job);
      return acc;
    }, {} as Record<string, Job[]>);
    
    // Sort shows alphabetically
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [jobs, globalFilter]);

  // Show color mapping
  const showColorMap = useMemo(() => {
    const shows = [...new Set(jobs.map(j => j.show || "Unknown"))].sort((a, b) => a.localeCompare(b));
    return shows.reduce((acc, show, index) => {
      acc[show] = accentColorList[index % accentColorList.length];
      return acc;
    }, {} as Record<string, { border: string; pill: string }>);
  }, [jobs]);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs");
      const data = await response.json();
      if (response.ok) {
        setJobs(data.jobs || []);
      } else {
        toast.error(data.error || "Failed to fetch jobs");
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleJobAction = async (jobId: string, action: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Job ${action} successful`);
        fetchJobs();
      } else {
        toast.error(data.error || `Failed to ${action} job`);
      }
    } catch (error) {
      console.error(`Job ${action} failed:`, error);
      toast.error(`Failed to ${action} job`);
    }
  };

  // Calculate summary stats
  const runningJobs = jobs.filter(j => j.state === "RUNNING" || (j.runningFrames > 0 && !j.isPaused)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Jobs</h1>
          <p className="text-text-muted text-xs mt-1">
            {jobs.length} {pluralize(jobs.length, 'job')} • {runningJobs} running • Auto-refreshing every 10s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
            <Input
              placeholder="Search jobs..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 w-64 h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchJobs();
            }}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Grouped by Show */}
      {loading && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-white/20 border-t-neutral-700 dark:border-t-white rounded-full animate-spin" />
            <span className="text-text-muted text-sm">Loading jobs...</span>
          </div>
        </div>
      )}
      {!loading && jobsByShow.length === 0 && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-2">
            <span className="text-text-muted">No jobs found</span>
            <span className="text-text-muted/50 text-xs">Try adjusting your search</span>
          </div>
        </div>
      )}
      {!loading && jobsByShow.length > 0 && (
        <div className="space-y-4">
          {jobsByShow.map(([show, showJobs]) => {
            const colors = showColorMap[show];
            const showRunning = showJobs.filter(j => j.state === "RUNNING" || (j.runningFrames > 0 && !j.isPaused)).length;
            const showTotalFrames = showJobs.reduce((sum, j) => sum + j.totalFrames, 0);
            const showSucceededFrames = showJobs.reduce((sum, j) => sum + j.succeededFrames, 0);
            
            return (
              <GroupedSection
                key={show}
                title={show.toUpperCase()}
                badge={`${showJobs.length} ${pluralize(showJobs.length, 'job')}`}
                stats={`${showRunning} running • ${showSucceededFrames}/${showTotalFrames} frames`}
                accentColors={colors}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
                      <TableHead>Job Name</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showJobs.map((job, index) => {
                      const state = job.isPaused ? "PAUSED" : job.state;
                      
                      return (
                        <TableRow
                          key={job.id}
                          className="hover:bg-neutral-50 dark:hover:bg-white/3 cursor-pointer transition-all duration-200 group"
                          onClick={() => {
                            setSelectedJob(job);
                            setDrawerOpen(true);
                          }}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <TableCell>
                            <div className="font-medium text-text-primary truncate max-w-xs">
                              {job.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(stateColors[state])}>
                              {state}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-text-secondary">{job.user}</span>
                          </TableCell>
                          <TableCell>
                            <ProgressBar job={job} />
                          </TableCell>
                          <TableCell>
                            <span className="text-text-muted">{job.priority}</span>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider delayDuration={300}>
                              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                {/* View Logs */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={iconButton.logs}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLogJob(job);
                                        setLogDialogOpen(true);
                                      }}
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    View Logs
                                  </TooltipContent>
                                </Tooltip>

                                {/* Pause/Resume */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={job.isPaused ? iconButton.activate : iconButton.pause}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleJobAction(job.id, job.isPaused ? "resume" : "pause");
                                      }}
                                    >
                                      {job.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {job.isPaused ? "Resume" : "Pause"}
                                  </TooltipContent>
                                </Tooltip>

                                {/* Retry Dead */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        iconButton.retry,
                                        job.deadFrames === 0 && "text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleJobAction(job.id, "retry");
                                      }}
                                      disabled={job.deadFrames === 0}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Retry Dead Frames ({job.deadFrames})
                                  </TooltipContent>
                                </Tooltip>

                                {/* Eat Dead */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        iconButton.eat,
                                        job.deadFrames === 0 && "text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleJobAction(job.id, "eat");
                                      }}
                                      disabled={job.deadFrames === 0}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Eat Dead Frames
                                  </TooltipContent>
                                </Tooltip>

                                {/* Kill Job */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={iconButton.kill}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleJobAction(job.id, "kill");
                                      }}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Kill Job
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </GroupedSection>
            );
          })}
        </div>
      )}

      <JobDetailDrawer
        job={selectedJob}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onJobUpdated={fetchJobs}
      />

      <LogViewerDialog
        job={logJob}
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
      />
    </div>
  );
}
