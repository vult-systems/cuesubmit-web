"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResizableTable,
  ResizableTableBody,
  ResizableTableCell,
  ResizableTableHead,
  ResizableTableHeader,
  ResizableTableRow,
} from "@/components/ui/resizable-table";
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
  ChevronLeft,
  ChevronRight,
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
  startTime: number;
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

type JobTab = "active" | "finished" | "all";

const TAB_CONFIG: { key: JobTab; label: string; description: string }[] = [
  { key: "active", label: "Active", description: "Running, pending & problematic jobs" },
  { key: "finished", label: "Finished", description: "Completed jobs" },
  { key: "all", label: "All", description: "All jobs including finished" },
];

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
  const [activeTab, setActiveTab] = useState<JobTab>("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

  // Filter jobs based on active tab (client-side filtering after API response)
  const filteredByTab = useMemo(() => {
    switch (activeTab) {
      case "active":
        return jobs.filter(j => j.state !== "FINISHED");
      case "finished":
        return jobs.filter(j => j.state === "FINISHED");
      case "all":
      default:
        return jobs;
    }
  }, [jobs, activeTab]);

  // Text-filtered jobs (before pagination), sorted newest first
  const textFiltered = useMemo(() => {
    const filtered = globalFilter
      ? filteredByTab.filter(job =>
          job.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
          job.user.toLowerCase().includes(globalFilter.toLowerCase()) ||
          job.show.toLowerCase().includes(globalFilter.toLowerCase())
        )
      : filteredByTab;
    return [...filtered].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }, [filteredByTab, globalFilter]);

  // Pagination
  const totalFiltered = textFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return textFiltered.slice(start, start + pageSize);
  }, [textFiltered, safePage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, globalFilter, pageSize]);

  // Group paginated jobs by show
  const jobsByShow = useMemo(() => {
    const grouped = paginatedJobs.reduce((acc, job) => {
      const show = job.show || "Unknown";
      if (!acc[show]) acc[show] = [];
      acc[show].push(job);
      return acc;
    }, {} as Record<string, Job[]>);
    
    // Sort shows alphabetically
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [paginatedJobs]);

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
      // Active tab only needs active jobs (faster query)
      // Finished & All tabs need includeFinished=true
      const includeFinished = activeTab !== "active";
      const response = await fetch(`/api/jobs?includeFinished=${includeFinished}`);
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
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
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
  const activeJobs = filteredByTab.length;
  const runningJobs = filteredByTab.filter(j => j.state === "RUNNING" || (j.runningFrames > 0 && !j.isPaused)).length;

  // Tab counts (from full dataset)
  const tabCounts = useMemo(() => ({
    active: jobs.filter(j => j.state !== "FINISHED").length,
    finished: jobs.filter(j => j.state === "FINISHED").length,
    all: jobs.length,
  }), [jobs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Jobs</h1>
          <p className="text-text-muted text-xs mt-1">
            {activeJobs} {pluralize(activeJobs, 'job')} • {runningJobs} running • Auto-refreshing every 10s
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

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-white/5 w-fit">
        {TAB_CONFIG.map(({ key, label, description }) => {
          const count = activeTab === "active" && key !== "active" 
            ? undefined  // Don't show counts for tabs that haven't fetched yet
            : tabCounts[key];
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              title={description}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5",
                activeTab === key
                  ? "bg-white dark:bg-white/10 text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary hover:bg-white/50 dark:hover:bg-white/5"
              )}
            >
              {label}
              {count !== undefined && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0 rounded-full min-w-5 text-center",
                  activeTab === key
                    ? "bg-neutral-100 dark:bg-white/10 text-text-secondary"
                    : "bg-neutral-200/60 dark:bg-white/5 text-text-muted"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
        <TooltipProvider delayDuration={200}>
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
                  <ResizableTable storageKey={`jobs-${show}`}>
                    <ResizableTableHeader>
                      <ResizableTableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
                        <ResizableTableHead columnId="name" minWidth={150} maxWidth={400}>Job Name</ResizableTableHead>
                        <ResizableTableHead columnId="state" minWidth={80} maxWidth={120}>State</ResizableTableHead>
                        <ResizableTableHead columnId="user" minWidth={80} maxWidth={150}>User</ResizableTableHead>
                        <ResizableTableHead columnId="progress" minWidth={150} maxWidth={250}>Progress</ResizableTableHead>
                        <ResizableTableHead columnId="priority" minWidth={60} maxWidth={100}>Priority</ResizableTableHead>
                        <ResizableTableHead columnId="actions" resizable={false} minWidth={140} maxWidth={140} className="text-right">Actions</ResizableTableHead>
                      </ResizableTableRow>
                    </ResizableTableHeader>
                    <ResizableTableBody>
                      {showJobs.map((job) => {
                        const state = job.isPaused ? "PAUSED" : job.state;
                      
                        return (
                          <ResizableTableRow
                            key={job.id}
                            className="hover:bg-neutral-50 dark:hover:bg-white/3 cursor-pointer transition-colors duration-150 group"
                            onClick={() => {
                              setSelectedJob(job);
                              setDrawerOpen(true);
                            }}
                          >
                            <ResizableTableCell columnId="name">
                              <div className="font-medium text-text-primary truncate">
                                {job.name}
                              </div>
                            </ResizableTableCell>
                            <ResizableTableCell columnId="state">
                              <Badge variant="outline" className={cn(stateColors[state], "text-[10px]")}>
                                {state}
                              </Badge>
                            </ResizableTableCell>
                            <ResizableTableCell columnId="user">
                              <span className="text-text-secondary text-xs">{job.user}</span>
                            </ResizableTableCell>
                            <ResizableTableCell columnId="progress">
                              <ProgressBar job={job} />
                            </ResizableTableCell>
                            <ResizableTableCell columnId="priority">
                              <span className="text-text-muted text-xs">{job.priority}</span>
                            </ResizableTableCell>
                            <ResizableTableCell columnId="actions">
                              { }
                              <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
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
                            </ResizableTableCell>
                          </ResizableTableRow>
                        );
                      })}
                    </ResizableTableBody>
                  </ResizableTable>
                </GroupedSection>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {/* Pagination Footer */}
      {!loading && totalFiltered > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Show</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-white/5">
              {PAGE_SIZE_OPTIONS.map(size => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded transition-all duration-150",
                    pageSize === size
                      ? "bg-white dark:bg-white/10 text-text-primary shadow-sm font-medium"
                      : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
            <span>per page</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">
              {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, totalFiltered)} of {totalFiltered}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-neutral-200 dark:border-white/10"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-text-secondary font-medium min-w-12 text-center">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-neutral-200 dark:border-white/10"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
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
