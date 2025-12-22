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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Lock, Unlock, Search, Power, Settings, Tag, X, Plus } from "lucide-react";
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
  swap: number;
  freeSwap: number;
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

function UsageBar({
  used,
  total,
  isMemory = false,
  showPercentage = true,
  colorMode = "default"
}: Readonly<{
  used: number;
  total: number;
  isMemory?: boolean;
  showPercentage?: boolean;
  colorMode?: "default" | "cores" | "load";
}>) {
  const percentage = total > 0 ? (used / total) * 100 : 0;

  // Color based on usage level and mode
  const getBarColor = () => {
    if (colorMode === "cores") {
      // Cores: green when in use (rendering), gray when idle
      if (percentage > 0) return "bg-emerald-500";
      return "bg-neutral-300 dark:bg-neutral-700";
    }
    if (colorMode === "load") {
      // Load: green < 50%, yellow 50-80%, red > 80%
      if (percentage > 80) return "bg-red-500";
      if (percentage > 50) return "bg-amber-500";
      return "bg-emerald-500";
    }
    // Memory: blue gradient based on usage
    if (percentage > 90) return "bg-red-500";
    if (percentage > 70) return "bg-amber-500";
    return "bg-blue-500";
  };

  return (
    <div className="space-y-0.5 min-w-0 w-full">
      <div className="flex items-center justify-between text-[10px] gap-1">
        {showPercentage && (
          <span className={cn(
            "font-medium shrink-0",
            percentage > 0 ? "text-text-primary" : "text-text-muted"
          )}>
            {Math.round(percentage)}%
          </span>
        )}
        <span className="text-text-muted truncate">
          {isMemory
            ? `${formatMemoryFromBytes(used)}/${formatMemoryFromBytes(total)}`
            : `${used}/${total}`
          }
        </span>
      </div>
      <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor())}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}

import { accentColorList } from "@/lib/accent-colors";
import { GroupedSection } from "@/components/grouped-section";

interface Allocation {
  id: string;
  name: string;
  tag: string;
  facility: string;
}

interface HostMetadata {
  opencue_host_id: string;
  display_id: string | null;
  system_name: string | null;
  notes: string | null;
  updated_at: string;
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [hostMetadata, setHostMetadata] = useState<Record<string, HostMetadata>>({});
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");

  // Host edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [newTag, setNewTag] = useState("");
  const [editId, setEditId] = useState("");
  const [editSystemName, setEditSystemName] = useState("");
  const [saving, setSaving] = useState(false);

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

  const fetchAllocations = useCallback(async () => {
    try {
      const response = await fetch("/api/allocations");
      const data = await response.json();
      if (response.ok) {
        setAllocations(data.allocations || []);
      }
    } catch (error) {
      console.error("Failed to fetch allocations:", error);
    }
  }, []);

  const fetchHostMetadata = useCallback(async () => {
    try {
      const response = await fetch("/api/host-metadata");
      const data = await response.json();
      if (response.ok) {
        // Convert array to map keyed by opencue_host_id
        const metadataMap: Record<string, HostMetadata> = {};
        for (const m of data.metadata || []) {
          metadataMap[m.opencue_host_id] = m;
        }
        setHostMetadata(metadataMap);
      }
    } catch (error) {
      console.error("Failed to fetch host metadata:", error);
    }
  }, []);

  useEffect(() => {
    fetchHosts();
    fetchAllocations();
    fetchHostMetadata();
    const interval = setInterval(fetchHosts, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchHosts, fetchAllocations, fetchHostMetadata]);

  const handleHostAction = async (hostId: string, action: string, extraData?: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/hosts/${hostId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extraData }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Host ${action} successful`);
        fetchHosts();
        return true;
      } else {
        const errorMsg = data.error || `Failed to ${action} host`;
        const details = data.details ? ` - ${data.details}` : "";
        toast.error(errorMsg + details);
        console.error("Host action error:", data);
        return false;
      }
    } catch (error) {
      console.error(`Host ${action} failed:`, error);
      toast.error(`Failed to ${action} host`);
      return false;
    }
  };

  const openEditDialog = (host: Host) => {
    setSelectedHost(host);
    setNewTag("");
    // Load existing metadata from local database
    const metadata = hostMetadata[host.id];
    setEditId(metadata?.display_id || "");
    setEditSystemName(metadata?.system_name || "");
    setEditDialogOpen(true);
  };

  const handleAddTag = async () => {
    if (!selectedHost || !newTag.trim()) return;

    setSaving(true);
    const success = await handleHostAction(selectedHost.id, "addTags", { tags: [newTag.trim()] });
    if (success) {
      // Update local state
      setSelectedHost({
        ...selectedHost,
        tags: [...(selectedHost.tags || []), newTag.trim()]
      });
      setNewTag("");
    }
    setSaving(false);
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedHost) return;

    setSaving(true);
    const success = await handleHostAction(selectedHost.id, "removeTags", { tags: [tag] });
    if (success) {
      // Update local state
      setSelectedHost({
        ...selectedHost,
        tags: (selectedHost.tags || []).filter(t => t !== tag)
      });
    }
    setSaving(false);
  };

  const handleSetAllocation = async (allocationId: string) => {
    if (!selectedHost) return;

    setSaving(true);
    const success = await handleHostAction(selectedHost.id, "setAllocation", { allocationId });
    if (success) {
      const allocation = allocations.find(a => a.id === allocationId);
      setSelectedHost({
        ...selectedHost,
        alloc: allocation?.name || ""
      });
    }
    setSaving(false);
  };

  const handleSaveMetadata = async () => {
    if (!selectedHost) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/host-metadata/${selectedHost.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_id: editId.trim() || null,
          system_name: editSystemName.trim() || null,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Host metadata saved");
        // Update local state
        setHostMetadata(prev => ({
          ...prev,
          [selectedHost.id]: data.metadata
        }));
      } else {
        toast.error(data.error || "Failed to save metadata");
      }
    } catch (error) {
      console.error("Failed to save host metadata:", error);
      toast.error("Failed to save metadata");
    }
    setSaving(false);
  };

  // Helper to extract group prefix from ID (e.g., "AD400" from "AD400-01")
  const getGroupFromId = useCallback((hostId: string) => {
    const metadata = hostMetadata[hostId];
    const displayId = metadata?.display_id;
    if (!displayId) return "Unassigned";
    // Extract prefix before the hyphen (e.g., "AD400" from "AD400-01")
    const parts = displayId.split("-");
    return parts[0] || "Unassigned";
  }, [hostMetadata]);

  // Group hosts by ID prefix (e.g., AD400, AD404)
  const hostsByGroup = useMemo(() => {
    const filtered = globalFilter
      ? hosts.filter(h => {
          const metadata = hostMetadata[h.id];
          const searchLower = globalFilter.toLowerCase();
          return (
            h.name.toLowerCase().includes(searchLower) ||
            h.alloc?.toLowerCase().includes(searchLower) ||
            h.ipAddress?.toLowerCase().includes(searchLower) ||
            metadata?.display_id?.toLowerCase().includes(searchLower) ||
            metadata?.system_name?.toLowerCase().includes(searchLower)
          );
        })
      : hosts;

    const grouped = filtered.reduce((acc, host) => {
      const group = getGroupFromId(host.id);
      if (!acc[group]) acc[group] = [];
      acc[group].push(host);
      return acc;
    }, {} as Record<string, Host[]>);

    // Sort hosts within each group by their display_id
    for (const group in grouped) {
      grouped[group].sort((a, b) => {
        const aId = hostMetadata[a.id]?.display_id || "";
        const bId = hostMetadata[b.id]?.display_id || "";
        // Natural sort to handle numbers correctly (AD400-2 before AD400-10)
        return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: "base" });
      });
    }

    // Sort groups alphabetically, but put "Unassigned" at the end
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });
  }, [hosts, globalFilter, hostMetadata, getGroupFromId]);

  // Group color mapping
  const groupColorMap = useMemo(() => {
    const groups = [...new Set(hosts.map(h => getGroupFromId(h.id)))].sort((a, b) => a.localeCompare(b));
    return groups.reduce((acc, group, index) => {
      acc[group] = accentColorList[index % accentColorList.length];
      return acc;
    }, {} as Record<string, { border: string; pill: string }>);
  }, [hosts, getGroupFromId]);

  // Summary stats
  const upHosts = hosts.filter((h) => h.state === "UP").length;
  const renderingHosts = hosts.filter((h) => h.state === "UP" && h.cores > h.idleCores).length;
  const totalCores = hosts.reduce((sum, h) => sum + h.cores, 0);
  const usedCores = hosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Hosts</h1>
          <p className="text-text-muted text-xs mt-1">
            {renderingHosts > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{renderingHosts} rendering</span>
            ) : (
              <span>{upHosts} up</span>
            )}
            {renderingHosts > 0 && ` • ${upHosts - renderingHosts} idle`}
            {" • "}
            <span className={usedCores > 0 ? "text-text-primary font-medium" : ""}>{usedCores}/{totalCores} cores</span>
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

      {/* Grouped by ID prefix */}
      {loading && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-white/20 border-t-neutral-700 dark:border-t-white rounded-full animate-spin" />
            <span className="text-text-muted text-sm">Loading hosts...</span>
          </div>
        </div>
      )}
      {!loading && hostsByGroup.length === 0 && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-white/6 bg-white/80 dark:bg-neutral-950/60 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center gap-2">
            <span className="text-text-muted">No hosts found</span>
            <span className="text-text-muted/50 text-xs">Try adjusting your search</span>
          </div>
        </div>
      )}
      {!loading && hostsByGroup.length > 0 && (
        <div className="space-y-4">
          {hostsByGroup.map(([group, groupHosts]) => {
            const colors = groupColorMap[group];
            const groupUpHosts = groupHosts.filter(h => h.state === "UP").length;
            const groupTotalCores = groupHosts.reduce((sum, h) => sum + h.cores, 0);
            const groupUsedCores = groupHosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);

            return (
              <GroupedSection
                key={group}
                title={group}
                badge={`${groupHosts.length} hosts`}
                stats={`${groupUpHosts} up • ${groupUsedCores}/${groupTotalCores} cores`}
                accentColors={colors}
              >
                <ResizableTable storageKey={`hosts-${group}`}>
                  <ResizableTableHeader>
                    <ResizableTableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
                      <ResizableTableHead columnId="id" minWidth={70} maxWidth={120}>ID</ResizableTableHead>
                      <ResizableTableHead columnId="system" minWidth={120} maxWidth={250}>System Name</ResizableTableHead>
                      <ResizableTableHead columnId="status" minWidth={80} maxWidth={140}>Status</ResizableTableHead>
                      <ResizableTableHead columnId="cores" minWidth={80} maxWidth={140}>Cores</ResizableTableHead>
                      <ResizableTableHead columnId="mem" minWidth={80} maxWidth={140}>Mem</ResizableTableHead>
                      <ResizableTableHead columnId="swap" minWidth={80} maxWidth={140}>Swap</ResizableTableHead>
                      <ResizableTableHead columnId="load" minWidth={70} maxWidth={120}>Load</ResizableTableHead>
                      <ResizableTableHead columnId="tags" minWidth={80} maxWidth={200}>Tags</ResizableTableHead>
                      <ResizableTableHead columnId="actions" resizable={false} minWidth={100} maxWidth={100} className="text-right">Actions</ResizableTableHead>
                    </ResizableTableRow>
                  </ResizableTableHeader>
                  <ResizableTableBody>
                    {groupHosts.map((host, index) => {
                      const isLocked = host.lockState === "LOCKED";
                      const isNimbyLocked = host.lockState === "NIMBY_LOCKED";
                      const isUp = host.state === "UP";

                      // Calculate usage
                      const coresUsed = host.cores - host.idleCores;
                      const memoryUsed = host.memory - host.idleMemory;
                      // Load per core (like CueGUI) - load is system load avg, divide by cores
                      const loadPerCore = host.cores > 0 ? Math.round(host.load / host.cores) : 0;
                      const isRendering = coresUsed > 0 && isUp;

                      // Get local metadata for this host
                      const metadata = hostMetadata[host.id];
                      const displayId = metadata?.display_id || "-";
                      const systemName = metadata?.system_name || "-";
                      // OpenCue's host.name is the IP address
                      const ipAddress = host.name;
                      // All tags are displayed (no more id:/name: prefix filtering)
                      const displayTags = host.tags || [];

                      return (
                        <ResizableTableRow
                          key={host.id}
                          className={cn(
                            "hover:bg-neutral-50 dark:hover:bg-white/3 transition-all duration-200 group",
                            isRendering && "bg-emerald-50/50 dark:bg-emerald-500/5"
                          )}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          {/* ID */}
                          <ResizableTableCell columnId="id" className="font-medium text-text-primary">
                            <div className="flex items-center gap-2">
                              {isRendering && (
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                              )}
                              <span className="truncate">{displayId}</span>
                            </div>
                          </ResizableTableCell>

                          {/* IP + System Name */}
                          <ResizableTableCell columnId="system">
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-mono text-xs text-text-primary truncate">{ipAddress}</div>
                              <div className="text-[10px] text-text-muted truncate">{systemName}</div>
                            </div>
                          </ResizableTableCell>

                          {/* Status - Combined state info */}
                          <ResizableTableCell columnId="status">
                            <div className="flex items-center gap-1.5">
                              {isUp && isRendering && (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                  Rendering
                                </Badge>
                              )}
                              {isUp && !isRendering && (
                                <Badge variant="outline" className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-text-muted border-neutral-200 dark:border-neutral-700">
                                  Idle
                                </Badge>
                              )}
                              {!isUp && (
                                <Badge variant="outline" className={cn(stateColors[host.state], "text-[10px]")}>
                                  {host.state}
                                </Badge>
                              )}
                              {(isLocked || isNimbyLocked) && (
                                <Lock className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                          </ResizableTableCell>

                          {/* Cores Usage - shows reserved vs total */}
                          <ResizableTableCell columnId="cores">
                            <UsageBar
                              used={coresUsed}
                              total={host.cores}
                              colorMode="cores"
                            />
                          </ResizableTableCell>

                          {/* Physical Memory - shows used vs total */}
                          <ResizableTableCell columnId="mem">
                            <UsageBar
                              used={memoryUsed}
                              total={host.memory}
                              isMemory={true}
                              colorMode="default"
                            />
                          </ResizableTableCell>

                          {/* Swap - shows used vs total */}
                          <ResizableTableCell columnId="swap">
                            <UsageBar
                              used={host.swap - host.freeSwap}
                              total={host.swap}
                              isMemory={true}
                              colorMode="default"
                            />
                          </ResizableTableCell>

                          {/* Load per core (like CueGUI) */}
                          <ResizableTableCell columnId="load">
                            <UsageBar
                              used={loadPerCore}
                              total={100}
                              colorMode="load"
                            />
                          </ResizableTableCell>

                          {/* Tags */}
                          <ResizableTableCell columnId="tags">
                            <div className="flex flex-wrap gap-1 min-w-0">
                              {displayTags.slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 truncate max-w-20"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {displayTags.length > 2 && (
                                <span className="text-[10px] text-text-muted">+{displayTags.length - 2}</span>
                              )}
                              {displayTags.length === 0 && (
                                <span className="text-xs text-text-muted">-</span>
                              )}
                            </div>
                          </ResizableTableCell>
                          <ResizableTableCell columnId="actions">
                            <TooltipProvider delayDuration={200}>
                              <div className="flex items-center justify-end gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={iconButton.settings}
                                      onClick={() => openEditDialog(host)}
                                    >
                                      <Settings className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Edit Host
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        // Color based on current state: OPEN=green, LOCKED=yellow
                                        isLocked || isNimbyLocked ? iconButton.lock : iconButton.activate,
                                        !isUp && "text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                                      )}
                                      onClick={() => handleHostAction(host.id, isLocked || isNimbyLocked ? "unlock" : "lock", { hostName: host.name })}
                                      disabled={!isUp}
                                    >
                                      {isLocked || isNimbyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {(() => {
                                      if (!isUp) return "Host must be UP to lock/unlock";
                                      return isLocked || isNimbyLocked ? "Unlock Host" : "Lock Host";
                                    })()}
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-neutral-400 dark:text-white/20 cursor-not-allowed hover:bg-transparent hover:text-neutral-400 dark:hover:text-white/20"
                                      disabled
                                    >
                                      <Power className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Reboot (coming soon)
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
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
      )}

      <p className="text-text-muted/50 text-xs">
        Auto-refreshing every 15s
      </p>

      {/* Host Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">
              Edit Host
            </DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              {selectedHost?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedHost && (
            <div className="space-y-6 py-4">
              {/* ID and System Name Section */}
              <div className="space-y-3">
                <Label className="text-text-muted text-xs font-medium">
                  Host Identification (Local Reference)
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-text-muted text-[10px]">ID (e.g., AD400-01)</Label>
                    <Input
                      placeholder="Enter ID..."
                      value={editId}
                      onChange={(e) => setEditId(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-text-muted text-[10px]">System Name</Label>
                    <Input
                      placeholder="Enter name..."
                      value={editSystemName}
                      onChange={(e) => setEditSystemName(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveMetadata}
                  disabled={saving}
                  className="h-8 px-3 text-xs"
                >
                  {saving ? "Saving..." : "Save Identification"}
                </Button>
              </div>

              {/* Tags Section */}
              <div className="space-y-3">
                <Label className="text-text-muted text-xs font-medium flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(selectedHost.tags || []).length === 0 ? (
                    <span className="text-text-muted text-xs">No tags</span>
                  ) : (
                    (selectedHost.tags || []).map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 pr-1"
                      >
                        {tag}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 hover:bg-sky-500/20 rounded-full"
                          onClick={() => handleRemoveTag(tag)}
                          disabled={saving}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add new tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTag();
                    }}
                    className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddTag}
                    disabled={saving || !newTag.trim()}
                    className="h-8 px-3 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Allocation Section */}
              {allocations.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-text-muted text-xs font-medium">
                    Allocation (Room)
                  </Label>
                  <Select
                    value={allocations.find(a => a.name === selectedHost.alloc)?.id || ""}
                    onValueChange={handleSetAllocation}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg">
                      <SelectValue placeholder="Select allocation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allocations.map((alloc) => (
                        <SelectItem key={alloc.id} value={alloc.id}>
                          {alloc.name.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Host Info */}
              <div className="space-y-2 pt-4 border-t border-neutral-200 dark:border-white/8">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-text-muted">State:</div>
                  <div className="font-medium">{selectedHost.state}</div>
                  <div className="text-text-muted">Lock State:</div>
                  <div className="font-medium">{selectedHost.lockState}</div>
                  <div className="text-text-muted">Cores:</div>
                  <div className="font-medium">{selectedHost.cores - selectedHost.idleCores}/{selectedHost.cores} in use</div>
                  <div className="text-text-muted">Memory:</div>
                  <div className="font-medium">
                    {formatMemory(selectedHost.memory - selectedHost.idleMemory)}/{formatMemory(selectedHost.memory)} in use
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
