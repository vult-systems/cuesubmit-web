"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState,
} from "@tanstack/react-table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  MoreHorizontal,
  Pause,
  Play,
  XCircle,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { JobDetailDrawer } from "@/components/job-detail-drawer";

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

const stateColors: Record<string, string> = {
  PENDING: "bg-warning-muted text-warning border-warning/30",
  RUNNING: "bg-section-cool-bg text-section-cool border-section-cool-border",
  FINISHED: "bg-success-muted text-success border-success/30",
  DEAD: "bg-danger-muted text-danger border-danger/30",
  PAUSED: "bg-surface-muted text-text-muted border-border",
};

function ProgressBar({ job }: { job: Job }) {
  const total = job.totalFrames || 1;
  const succeeded = (job.succeededFrames / total) * 100;
  const running = (job.runningFrames / total) * 100;
  const dead = (job.deadFrames / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-surface-muted rounded-full overflow-hidden flex">
        <div className="bg-success" style={{ width: `${succeeded}%` }} />
        <div className="bg-section-cool" style={{ width: `${running}%` }} />
        <div className="bg-danger" style={{ width: `${dead}%` }} />
      </div>
      <span className="text-xs text-text-muted">
        {job.succeededFrames}/{job.totalFrames}
      </span>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const columns: ColumnDef<Job>[] = [
    {
      accessorKey: "name",
      header: "Job Name",
      cell: ({ row }) => (
        <div className="font-medium text-text-primary truncate max-w-xs">
          {row.getValue("name")}
        </div>
      ),
    },
    {
      accessorKey: "state",
      header: "State",
      cell: ({ row }) => {
        const state = row.original.isPaused ? "PAUSED" : row.getValue<string>("state");
        return (
          <Badge variant="outline" className={cn("text-xs", stateColors[state])}>
            {state}
          </Badge>
        );
      },
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.getValue("user")}</span>
      ),
    },
    {
      accessorKey: "show",
      header: "Show",
      cell: ({ row }) => (
        <span className="text-text-muted">{row.getValue("show")}</span>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => <ProgressBar job={row.original} />,
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <span className="text-text-muted">{row.getValue("priority")}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface-raised border-border">
              {job.isPaused ? (
                <DropdownMenuItem
                  onClick={() => handleJobAction(job.id, "resume")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleJobAction(job.id, "pause")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => handleJobAction(job.id, "retry")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                Retry Dead Frames
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleJobAction(job.id, "eat")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                Eat Dead Frames
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleJobAction(job.id, "kill")}
                className="flex items-center gap-2 text-danger focus:text-danger cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
                Kill Job
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Jobs</h1>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search jobs..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 w-64 bg-surface-muted border-border"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchJobs();
            }}
            disabled={loading}
            className="border-border"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-text-muted">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-text-muted">
                  Loading jobs...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-text-muted">
                  No jobs found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-border hover:bg-surface-muted/50 cursor-pointer"
                  onClick={() => {
                    setSelectedJob(row.original);
                    setDrawerOpen(true);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-text-muted">
        {jobs.length} job{jobs.length !== 1 ? "s" : ""} • Auto-refreshing every 10s
      </div>

      <JobDetailDrawer
        job={selectedJob}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onJobUpdated={fetchJobs}
      />
    </div>
  );
}
