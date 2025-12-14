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
import { Progress } from "@/components/ui/progress";
import { RefreshCw, MoreHorizontal, Lock, Unlock, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Host {
  id: string;
  name: string;
  state: string;
  lockState: string;
  nimbyEnabled: boolean;
  cores: number;
  idleCores: number;
  memory: number;
  idleMemory: number;
  load: number;
  bootTime: number;
  pingTime: number;
}

const stateColors: Record<string, string> = {
  UP: "bg-success-muted text-success border-success/30",
  DOWN: "bg-danger-muted text-danger border-danger/30",
  REPAIR: "bg-warning-muted text-warning border-warning/30",
  UNKNOWN: "bg-surface-muted text-text-muted border-border",
};

const lockStateColors: Record<string, string> = {
  OPEN: "bg-success-muted text-success border-success/30",
  LOCKED: "bg-danger-muted text-danger border-danger/30",
  NIMBY_LOCKED: "bg-warning-muted text-warning border-warning/30",
};

function formatMemory(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const percentage = total > 0 ? ((total - used) / total) * 100 : 0;
  const usedAmount = total - used;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span>{Math.round(percentage)}%</span>
      </div>
      <Progress
        value={percentage}
        className="h-2 bg-surface-muted"
      />
      <div className="text-xs text-text-muted">
        {label === "Cores"
          ? `${usedAmount}/${total} used`
          : `${formatMemory(usedAmount * 1024 * 1024)}/${formatMemory(total * 1024 * 1024)} used`
        }
      </div>
    </div>
  );
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const fetchHosts = useCallback(async () => {
    try {
      const response = await fetch("/api/hosts");
      const data = await response.json();
      if (response.ok) {
        setHosts(data.hosts || []);
      } else {
        toast.error(data.error || "Failed to fetch hosts");
      }
    } catch (error) {
      console.error("Failed to fetch hosts:", error);
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHosts();
    const interval = setInterval(fetchHosts, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchHosts]);

  const handleHostAction = async (hostId: string, action: string) => {
    try {
      const response = await fetch(`/api/hosts/${hostId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Host ${action} successful`);
        fetchHosts();
      } else {
        toast.error(data.error || `Failed to ${action} host`);
      }
    } catch (error) {
      console.error(`Host ${action} failed:`, error);
      toast.error(`Failed to ${action} host`);
    }
  };

  const columns: ColumnDef<Host>[] = [
    {
      accessorKey: "name",
      header: "Hostname",
      cell: ({ row }) => (
        <div className="font-medium text-text-primary">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "state",
      header: "State",
      cell: ({ row }) => {
        const state = row.getValue<string>("state");
        return (
          <Badge variant="outline" className={cn("text-xs", stateColors[state])}>
            {state}
          </Badge>
        );
      },
    },
    {
      accessorKey: "lockState",
      header: "Lock",
      cell: ({ row }) => {
        const lockState = row.getValue<string>("lockState");
        return (
          <Badge variant="outline" className={cn("text-xs", lockStateColors[lockState])}>
            {lockState}
          </Badge>
        );
      },
    },
    {
      id: "cores",
      header: "Cores",
      cell: ({ row }) => {
        const host = row.original;
        return (
          <div className="w-32">
            <UsageBar used={host.idleCores} total={host.cores} label="Cores" />
          </div>
        );
      },
    },
    {
      id: "memory",
      header: "Memory",
      cell: ({ row }) => {
        const host = row.original;
        return (
          <div className="w-32">
            <UsageBar used={host.idleMemory} total={host.memory} label="Memory" />
          </div>
        );
      },
    },
    {
      accessorKey: "load",
      header: "Load",
      cell: ({ row }) => {
        const load = row.getValue<number>("load") / 100;
        return (
          <span className={cn(
            "text-sm",
            load > 0.8 ? "text-danger" : load > 0.5 ? "text-warning" : "text-text-muted"
          )}>
            {load.toFixed(2)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const host = row.original;
        const isLocked = host.lockState === "LOCKED";
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface-raised border-border">
              {isLocked ? (
                <DropdownMenuItem
                  onClick={() => handleHostAction(host.id, "unlock")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Unlock className="h-4 w-4" />
                  Unlock Host
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleHostAction(host.id, "lock")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Lock className="h-4 w-4" />
                  Lock Host
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: hosts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
  });

  // Summary stats
  const upHosts = hosts.filter((h) => h.state === "UP").length;
  const totalCores = hosts.reduce((sum, h) => sum + h.cores, 0);
  const usedCores = hosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Hosts</h1>
          <p className="text-text-muted text-sm mt-1">
            {upHosts} hosts up • {usedCores}/{totalCores} cores in use
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search hosts..."
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
              fetchHosts();
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
                  Loading hosts...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-text-muted">
                  No hosts found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-border hover:bg-surface-muted/50"
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
        {hosts.length} host{hosts.length !== 1 ? "s" : ""} • Auto-refreshing every 15s
      </div>
    </div>
  );
}
