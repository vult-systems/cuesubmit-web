"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Lock, Unlock, Search, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { iconButton } from "@/lib/icon-button-styles";

interface Host {
  id: string;
  name: string;
  state: string;
  lockState: string;
  nimbyEnabled: boolean;
  nimbyLocked?: boolean;
  cores: number;
  idleCores: number;
  memory: number;
  idleMemory: number;
  gpuMemory?: number;
  idleGpuMemory?: number;
  gpus?: number;
  idleGpus?: number;
  load: number;
  bootTime: number;
  pingTime: number;
  tags?: string[];
  alloc?: string;
  ipAddress?: string;
}

const stateColors: Record<string, string> = {
  UP: "bg-success/15 dark:bg-success/10 text-success border-success/30 dark:border-success/20",
  DOWN: "bg-danger/15 dark:bg-danger/10 text-danger border-danger/30 dark:border-danger/20",
  REPAIR: "bg-warning/15 dark:bg-warning/10 text-warning border-warning/30 dark:border-warning/20",
  UNKNOWN: "bg-surface-muted text-text-muted border-border",
};

const lockStateColors: Record<string, string> = {
  OPEN: "bg-success/15 dark:bg-success/10 text-success border-success/30 dark:border-success/20",
  LOCKED: "bg-danger/15 dark:bg-danger/10 text-danger border-danger/30 dark:border-danger/20",
  NIMBY_LOCKED: "bg-warning/15 dark:bg-warning/10 text-warning border-warning/30 dark:border-warning/20",
};

function formatMemory(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Math.round(gb)}G`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)}M`;
}

function formatMemoryFromBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Math.round(gb)}G`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)}M`;
  }
  const kb = bytes / 1024;
  return `${Math.round(kb)}K`;
}

function UsageBar({ used, total, label, isMemory = false }: { used: number; total: number; label: string; isMemory?: boolean }) {
  const percentage = total > 0 ? ((total - used) / total) * 100 : 0;
  const usedAmount = total - used;

  return (
    <div className="space-y-0.5 min-w-20">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-neutral-600 dark:text-white/60 font-medium">{Math.round(percentage)}%</span>
        <span className="text-neutral-400 dark:text-white/30 text-[10px]">
          {isMemory
            ? `${formatMemoryFromBytes(usedAmount)}/${formatMemoryFromBytes(total)}`
            : `${usedAmount}/${total}`
          }
        </span>
      </div>
      <Progress
        value={percentage}
        className="h-1.5 bg-neutral-200 dark:bg-neutral-950/60"
      />
    </div>
  );
}

import { accentColorList } from "@/lib/accent-colors";
import { GroupedSection } from "@/components/grouped-section";

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
      id: "stickerId",
      header: "ID",
      cell: ({ row }) => {
        const name = row.original.name;
        // Extract the sticker ID (part before the space/parenthesis, e.g., "AD400-01" from "AD400-01 (SYSTEMNAME)")
        const stickerId = name.split(' ')[0].split('.')[0];
        return (
          <div className="font-medium text-text-primary">{stickerId}</div>
        );
      },
    },
    {
      id: "systemName",
      header: "System Name",
      cell: ({ row }) => {
        const name = row.original.name;
        // Extract system name from parentheses, e.g., "SYSTEMNAME" from "AD400-01 (SYSTEMNAME)"
        const match = name.match(/\(([^)]+)\)/);
        const systemName = match ? match[1] : name;
        return (
          <div className="font-mono text-xs text-text-muted">{systemName}</div>
        );
      },
    },
    {
      accessorKey: "ipAddress",
      header: "IP Address",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-text-muted">
          {row.getValue("ipAddress") || "-"}
        </span>
      ),
    },
    {
      accessorKey: "alloc",
      header: "Room",
      cell: ({ row }) => (
        <span className="text-xs text-text-muted uppercase">
          {row.getValue("alloc") || "-"}
        </span>
      ),
    },
    {
      accessorKey: "state",
      header: "State",
      cell: ({ row }) => {
        const state = row.getValue<string>("state");
        return (
          <Badge variant="outline" className={cn(stateColors[state])}>
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
          <Badge variant="outline" className={cn(lockStateColors[lockState])}>
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
          <div className="w-24">
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
          <div className="w-24">
            <UsageBar used={host.idleMemory} total={host.memory} label="Memory" isMemory />
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
      header: "Actions",
      cell: ({ row }) => {
        const host = row.original;
        const isLocked = host.lockState === "LOCKED";
        const isUp = host.state === "UP";
        return (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1">
              {/* Lock/Unlock */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={isLocked ? iconButton.lock : iconButton.activate}
                    onClick={() => handleHostAction(host.id, isLocked ? "unlock" : "lock")}
                  >
                    {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isLocked ? "Unlock Host" : "Lock Host"}
                </TooltipContent>
              </Tooltip>

              {/* Reboot */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      iconButton.retry,
                      !isUp && "text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                    )}
                    onClick={() => handleHostAction(host.id, "reboot")}
                    disabled={!isUp}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Reboot Host
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        );
      },
    },
  ];

  // Group hosts by room (alloc)
  const hostsByRoom = useMemo(() => {
    const filtered = globalFilter
      ? hosts.filter(h => 
          h.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
          h.alloc?.toLowerCase().includes(globalFilter.toLowerCase()) ||
          h.ipAddress?.toLowerCase().includes(globalFilter.toLowerCase())
        )
      : hosts;
    
    const grouped = filtered.reduce((acc, host) => {
      const room = host.alloc || "Unassigned";
      if (!acc[room]) acc[room] = [];
      acc[room].push(host);
      return acc;
    }, {} as Record<string, Host[]>);
    
    // Sort rooms alphabetically
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [hosts, globalFilter]);

  // Room color mapping
  const roomColorMap = useMemo(() => {
    const rooms = [...new Set(hosts.map(h => h.alloc || "Unassigned"))].sort();
    return rooms.reduce((acc, room, index) => {
      acc[room] = accentColorList[index % accentColorList.length];
      return acc;
    }, {} as Record<string, { border: string; pill: string }>);
  }, [hosts]);

  // Summary stats
  const upHosts = hosts.filter((h) => h.state === "UP").length;
  const totalCores = hosts.reduce((sum, h) => sum + h.cores, 0);
  const usedCores = hosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Hosts</h1>
          <p className="text-text-muted text-xs mt-1">
            {upHosts} hosts up • {usedCores}/{totalCores} cores in use
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
            <Input
              placeholder="Search hosts..."
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
              fetchHosts();
            }}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Grouped by Room */}
      {loading ? (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-white/20 border-t-neutral-700 dark:border-t-white rounded-full animate-spin" />
            <span className="text-text-muted text-sm">Loading hosts...</span>
          </div>
        </div>
      ) : hostsByRoom.length === 0 ? (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-2">
            <span className="text-text-muted">No hosts found</span>
            <span className="text-text-muted/50 text-xs">Try adjusting your search</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {hostsByRoom.map(([room, roomHosts]) => {
            const colors = roomColorMap[room];
            const roomUpHosts = roomHosts.filter(h => h.state === "UP").length;
            const roomTotalCores = roomHosts.reduce((sum, h) => sum + h.cores, 0);
            const roomUsedCores = roomHosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);
            
            return (
              <GroupedSection
                key={room}
                title={room.toUpperCase()}
                badge={`${roomHosts.length} hosts`}
                stats={`${roomUpHosts} up • ${roomUsedCores}/${roomTotalCores} cores`}
                accentColors={colors}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
                      <TableHead>ID</TableHead>
                      <TableHead>System Name</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Lock</TableHead>
                      <TableHead>Cores</TableHead>
                      <TableHead>Memory</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roomHosts.map((host, index) => {
                      const stickerId = host.name.split(' ')[0].split('.')[0];
                      const match = host.name.match(/\(([^)]+)\)/);
                      const systemName = match ? match[1] : host.name;
                      const isLocked = host.lockState === "LOCKED";
                      const isNimbyLocked = host.lockState === "NIMBY_LOCKED";
                      const isUp = host.state === "UP";
                      
                      return (
                        <TableRow
                          key={host.id}
                          className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-all duration-200 group"
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <TableCell className="font-medium text-text-primary">{stickerId}</TableCell>
                          <TableCell className="font-mono text-xs text-text-muted">{systemName}</TableCell>
                          <TableCell className="font-mono text-xs text-text-muted">{host.ipAddress || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(stateColors[host.state])}>
                              {host.state}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(lockStateColors[host.lockState])}>
                              {host.lockState}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="w-24">
                              <UsageBar used={host.idleCores} total={host.cores} label="Cores" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-24">
                              <UsageBar used={host.idleMemory} total={host.memory} label="Mem" isMemory />
                            </div>
                          </TableCell>
                          <TableCell>
                            {host.gpuMemory && host.gpuMemory > 0 ? (
                              <div className="w-24">
                                <UsageBar used={host.idleGpuMemory || 0} total={host.gpuMemory} label="GPU" isMemory />
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <TooltipProvider delayDuration={200}>
                              <div className="flex items-center justify-end gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        isLocked || isNimbyLocked ? iconButton.activate : iconButton.lock
                                      )}
                                      onClick={() => handleHostAction(host.id, isLocked || isNimbyLocked ? "unlock" : "lock")}
                                    >
                                      {isLocked || isNimbyLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {isLocked || isNimbyLocked ? "Unlock Host" : "Lock Host"}
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        iconButton.retry,
                                        !isUp && "text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                                      )}
                                      onClick={() => handleHostAction(host.id, "reboot")}
                                      disabled={!isUp}
                                    >
                                      <Power className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Reboot Host
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

      <p className="text-text-muted/50 text-xs">
        Auto-refreshing every 15s
      </p>
    </div>
  );
}
