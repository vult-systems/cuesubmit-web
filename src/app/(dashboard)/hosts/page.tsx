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
import { RefreshCw, Lock, Unlock, Search, Power, Settings, Tag, X, Plus, Trash2, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { iconButton } from "@/lib/icon-button-styles";

interface Host {
  id: string;
  name: string;
  hostname: string | null;
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

interface HostMetadata {
  hostname: string;
  display_id: string | null;
  notes: string | null;
  updated_at: string;
}

// Extract display ID from tags (e.g., "AD415-05" from ["general", "AD415", "AD415-05"])
// Matches tags like AD400-01, AD415-INST — a letters+digits prefix, hyphen, then suffix
function getDisplayIdFromTags(tags: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  // Find the most specific tag: room prefix + hyphen + identifier (number or INST etc.)
  const match = tags.find(t => /^[A-Za-z]+\d+-\w+$/.test(t));
  return match?.toUpperCase() || null;
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");

  // Host edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  // Host delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hostToDelete, setHostToDelete] = useState<Host | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status filter and per-room unlock state
  const [stateFilter, setStateFilter] = useState<"all" | "available" | "up" | "down" | "locked" | "nimby">("all");
  const [unlockingRooms, setUnlockingRooms] = useState<Set<string>>(new Set());
  const [autoUnlocking, setAutoUnlocking] = useState(false);

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

// Auto-unlock: clear locked idle hosts every 5 minutes
  useEffect(() => {
    const runAutoUnlock = async () => {
      try {
        const res = await fetch("/api/admin/hosts/auto-unlock", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.count > 0) {
          toast.success(`Auto-unlocked ${data.count} idle host${data.count !== 1 ? "s" : ""}`);
          fetchHosts();
        }
      } catch {
        // silently ignore
      }
    };
    // Run quickly after page load, then every 5 min
    const initial = setTimeout(runAutoUnlock, 3_000);
    const interval = setInterval(runAutoUnlock, 5 * 60 * 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchHosts]);

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

  const handleDeleteHost = async () => {
    if (!hostToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/hosts/${hostToDelete.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Host ${hostToDelete.name} deleted`);
        setDeleteDialogOpen(false);
        setHostToDelete(null);
        fetchHosts();
      } else {
        const errorMsg = data.error || "Failed to delete host";
        const details = data.details ? ` — ${data.details}` : "";
        toast.error(errorMsg + details);
      }
    } catch (error) {
      console.error("Failed to delete host:", error);
      toast.error("Failed to delete host");
    }
    setDeleting(false);
  };

  // Manually unlock all idle locked hosts and refresh
  const handleUnlockAllIdle = useCallback(async () => {
    setAutoUnlocking(true);
    try {
      const res = await fetch("/api/admin/hosts/auto-unlock", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Unlock failed");
        return;
      }
      if (data.count === 0) {
        toast.info("No idle locked hosts found");
      } else {
        const errMsg = data.errors?.length > 0
          ? ` (${data.errors.length} failed — host may be down)`
          : "";
        toast.success(`Released ${data.count} idle host${data.count !== 1 ? "s" : ""}${errMsg}`);
      }
      fetchHosts();
    } catch {
      toast.error("Unlock request failed");
    } finally {
      setAutoUnlocking(false);
    }
  }, [fetchHosts]);

  // Force-unlock ALL locked hosts (NIMBY + manual), regardless of whether frames are running
  const handleForceUnlockAll = useCallback(async () => {
    setAutoUnlocking(true);
    try {
      const res = await fetch("/api/admin/hosts/auto-unlock?force=true", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Force unlock failed");
        return;
      }
      if (data.count === 0) {
        toast.info("No locked hosts found");
      } else {
        const errMsg = data.errors?.length > 0
          ? ` (${data.errors.length} failed)`
          : "";
        toast.success(`Force-unlocked ${data.count} host${data.count !== 1 ? "s" : ""}${errMsg}`);
      }
      fetchHosts();
    } catch {
      toast.error("Force unlock request failed");
    } finally {
      setAutoUnlocking(false);
    }
  }, [fetchHosts]);

  // Bulk-unlock all locked hosts in a room (no per-host toast — shows summary)
  const handleUnlockRoom = useCallback(async (group: string, groupHosts: Host[]) => {
    const locked = groupHosts.filter(
      (h) => h.lockState === "LOCKED" || h.lockState === "NIMBY_LOCKED"
    );
    if (locked.length === 0) return;

    setUnlockingRooms((prev) => new Set([...prev, group]));
    const results = await Promise.allSettled(
      locked.map((h) =>
        fetch(`/api/hosts/${h.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unlock", hostName: h.name }),
        }).then((r) => { if (!r.ok) throw new Error(`${r.status}`); })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    setUnlockingRooms((prev) => {
      const next = new Set(prev);
      next.delete(group);
      return next;
    });
    if (failed === 0) {
      toast.success(`Unlocked ${succeeded} host${succeeded !== 1 ? "s" : ""} in ${group}`);
    } else {
      toast.warning(`Unlocked ${succeeded}/${locked.length} — ${failed} failed (host may be down)`);
    }
    fetchHosts();
  }, [fetchHosts]);

  // Extract display ID from tags for a host
  const getDisplayIdForHost = useCallback((host: Host) => {
    return getDisplayIdFromTags(host.tags || []);
  }, []);

  // Helper to extract group prefix from tag-derived ID (e.g., "AD400" from "AD400-01")
  const getGroupFromHost = useCallback((host: Host) => {
    const displayId = getDisplayIdForHost(host);
    if (!displayId) return "Unassigned";
    const parts = displayId.split("-");
    return parts[0] || "Unassigned";
  }, [getDisplayIdForHost]);

  // Group hosts by ID prefix (e.g., AD400, AD404)
  const hostsByGroup = useMemo(() => {
    const filtered = hosts.filter((h) => {
      // Text search filter
      if (globalFilter) {
        const displayId = getDisplayIdForHost(h);
        const q = globalFilter.toLowerCase();
        if (
          !h.name.toLowerCase().includes(q) &&
          !h.hostname?.toLowerCase().includes(q) &&
          !h.alloc?.toLowerCase().includes(q) &&
          !displayId?.toLowerCase().includes(q)
        ) return false;
      }
      // State filter
      if (stateFilter === "available") return h.state === "UP" && h.lockState !== "LOCKED" && h.lockState !== "NIMBY_LOCKED";
      if (stateFilter === "up") return h.state === "UP";
      if (stateFilter === "down") return h.state !== "UP";
      if (stateFilter === "locked") return h.lockState === "LOCKED";
      if (stateFilter === "nimby") return h.lockState === "NIMBY_LOCKED";
      return true;
    });

    const grouped = filtered.reduce((acc, host) => {
      const group = getGroupFromHost(host);
      if (!acc[group]) acc[group] = [];
      acc[group].push(host);
      return acc;
    }, {} as Record<string, Host[]>);

    // Sort hosts within each group by their tag-derived display_id
    for (const group in grouped) {
      grouped[group].sort((a, b) => {
        const aId = getDisplayIdForHost(a) || "";
        const bId = getDisplayIdForHost(b) || "";
        return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: "base" });
      });
    }

    // Sort groups alphabetically, but put "Unassigned" at the end
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });
  }, [hosts, globalFilter, stateFilter, getDisplayIdForHost, getGroupFromHost]);

  // Group color mapping
  const groupColorMap = useMemo(() => {
    const groups = [...new Set(hosts.map(h => getGroupFromHost(h)))].sort((a, b) => a.localeCompare(b));
    return groups.reduce((acc, group, index) => {
      acc[group] = accentColorList[index % accentColorList.length];
      return acc;
    }, {} as Record<string, { border: string; pill: string }>);
  }, [hosts, getGroupFromHost]);

  // Summary stats
  const upHosts = hosts.filter((h) => h.state === "UP").length;
  const availableHosts = hosts.filter((h) => h.state === "UP" && h.lockState !== "LOCKED" && h.lockState !== "NIMBY_LOCKED").length;
  const renderingHosts = hosts.filter((h) => h.state === "UP" && h.cores > h.idleCores).length;
  const totalCores = hosts.reduce((sum, h) => sum + h.cores, 0);
  const usedCores = hosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);
  const lockedCount = hosts.filter((h) => h.lockState === "LOCKED" || h.lockState === "NIMBY_LOCKED").length;
  const nimbyLockedCount = hosts.filter((h) => h.lockState === "NIMBY_LOCKED").length;
  const manualLockedCount = hosts.filter((h) => h.lockState === "LOCKED").length;
  const downCount = hosts.filter((h) => h.state !== "UP").length;

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
            {nimbyLockedCount > 0 && (
              <> • <span className="text-amber-500 font-medium">{nimbyLockedCount} in use</span></>
            )}
            {manualLockedCount > 0 && (
              <> • <span className="text-orange-500 font-medium">{manualLockedCount} locked</span></>
            )}
            {downCount > 0 && (
              <> • <span className="text-danger">{downCount} down</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
            <Input
              placeholder="Search hosts..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 w-48 h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
            />
          </div>
          {/* Unlock idle hosts: releases NIMBY + idle-manual locks */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlockAllIdle}
            disabled={autoUnlocking || lockedCount === 0}
            className={cn(
              "h-8 gap-1.5 text-xs",
              lockedCount > 0 && !autoUnlocking
                ? "border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                : ""
            )}
            title={lockedCount === 0 ? "No locked hosts" : `Unlock all ${lockedCount} locked idle hosts`}
          >
            {autoUnlocking
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Unlock className="h-3.5 w-3.5" />}
            {autoUnlocking ? "Unlocking…" : `Unlock idle${lockedCount > 0 ? ` (${lockedCount})` : ""}`}
          </Button>
          {/* Force unlock: clears ALL locks on UP hosts, including manual, regardless of frames */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceUnlockAll}
            disabled={autoUnlocking || lockedCount === 0}
            className={cn(
              "h-8 gap-1.5 text-xs",
              lockedCount > 0 && !autoUnlocking
                ? "border-red-400 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                : ""
            )}
            title={lockedCount === 0 ? "No locked hosts" : `Force-unlock ALL ${lockedCount} locked hosts (ignores idle check)`}
          >
            <Unlock className="h-3.5 w-3.5" />
            Force unlock all
          </Button>
          {/* Refresh: re-fetch host list from OpenCue */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchHosts(); }}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", "available", "up", "nimby", "locked", "down"] as const).map((f) => {
          const labels: Record<string, string> = { all: "All", available: "Available", up: "UP", nimby: "In Use", locked: "Locked", down: "Down" };
          const count =
            f === "all" ? hosts.length :
            f === "available" ? availableHosts :
            f === "up" ? upHosts :
            f === "nimby" ? nimbyLockedCount :
            f === "locked" ? manualLockedCount :
            downCount;
          if (f !== "all" && count === 0) return null;
          return (
            <button
              key={f}
              onClick={() => setStateFilter(f)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                stateFilter === f
                  ? f === "available"
                    ? "bg-sky-600 text-white border-sky-600"
                    : f === "nimby"
                      ? "bg-amber-500 text-white border-amber-500"
                      : f === "locked"
                        ? "bg-orange-500 text-white border-orange-500"
                        : f === "down"
                          ? "bg-danger text-white border-danger"
                          : "bg-blue-600 text-white border-blue-600"
                  : "bg-transparent text-text-muted border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 hover:text-text-primary"
              )}
            >
              {labels[f]} <span className={stateFilter === f ? "opacity-80" : "opacity-60"}>{count}</span>
            </button>
          );
        })}
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
        <TooltipProvider delayDuration={200}>
          <div className="space-y-4">
            {hostsByGroup.map(([group, groupHosts]) => {
            const colors = groupColorMap[group];
            const groupUpHosts = groupHosts.filter(h => h.state === "UP").length;
            const groupTotalCores = groupHosts.reduce((sum, h) => sum + h.cores, 0);
            const groupUsedCores = groupHosts.reduce((sum, h) => sum + (h.cores - h.idleCores), 0);
            const groupLockedHosts = groupHosts.filter(
              (h) => h.lockState === "LOCKED" || h.lockState === "NIMBY_LOCKED"
            );
            const isUnlockingRoom = unlockingRooms.has(group);

            return (
              <GroupedSection
                key={group}
                title={group}
                badge={`${groupHosts.length} hosts`}
                stats={[
                  `${groupUpHosts} up`,
                  `${groupUsedCores}/${groupTotalCores} cores`,
                  groupLockedHosts.length > 0 ? `${groupLockedHosts.length} locked` : null,
                ].filter(Boolean).join(" • ")}
                accentColors={colors}
                rightContent={
                  groupLockedHosts.length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnlockRoom(group, groupHosts);
                      }}
                      disabled={isUnlockingRoom}
                      title={`Unlock all ${groupLockedHosts.length} locked host${groupLockedHosts.length !== 1 ? "s" : ""} in ${group}`}
                      className={cn(
                        "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors",
                        isUnlockingRoom
                          ? "text-text-muted cursor-wait"
                          : "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                      )}
                    >
                      {isUnlockingRoom
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Unlock className="h-3 w-3" />}
                      Unlock room
                    </button>
                  ) : null
                }
              >
                <ResizableTable storageKey={`hosts-${group}`}>
                  <ResizableTableHeader>
                    <ResizableTableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
                      <ResizableTableHead columnId="id" minWidth={70} maxWidth={120}>ID</ResizableTableHead>
                      <ResizableTableHead columnId="system" minWidth={120} maxWidth={250}>Hostname</ResizableTableHead>
                      <ResizableTableHead columnId="status" minWidth={80} maxWidth={140}>Status</ResizableTableHead>
                      <ResizableTableHead columnId="cores" minWidth={80} maxWidth={140}>Cores</ResizableTableHead>
                      <ResizableTableHead columnId="mem" minWidth={80} maxWidth={140}>Mem</ResizableTableHead>
                      <ResizableTableHead columnId="tags" minWidth={80} maxWidth={200}>Tags</ResizableTableHead>
                      <ResizableTableHead columnId="actions" resizable={false} minWidth={100} maxWidth={100} className="text-right">Actions</ResizableTableHead>
                    </ResizableTableRow>
                  </ResizableTableHeader>
                  <ResizableTableBody>
                    {groupHosts.map((host) => {
                      const isLocked = host.lockState === "LOCKED";
                      const isNimbyLocked = host.lockState === "NIMBY_LOCKED";
                      const isUp = host.state === "UP";

                      // Calculate usage
                      const coresUsed = host.cores - host.idleCores;
                      const memoryUsed = host.memory - host.idleMemory;
                      const isRendering = coresUsed > 0 && isUp;

                      // Derive display ID from tags (e.g., AD415-05)
                      const displayId = getDisplayIdForHost(host) || "-";
                      // Hostname from DNS, displayed uppercase
                      const hostname = host.hostname ? host.hostname.toUpperCase() : "-";
                      // OpenCue's host.name is the IP address
                      const ipAddress = host.name;
                      // All tags are displayed
                      const displayTags = host.tags || [];

                      return (
                        <ResizableTableRow
                          key={host.id}
                          className={cn(
                            "hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors duration-150 group",
                            isRendering && !isNimbyLocked && !isLocked && "bg-emerald-50/50 dark:bg-emerald-500/5",
                            isNimbyLocked && "bg-amber-50/40 dark:bg-amber-500/4",
                            isLocked && "bg-orange-50/40 dark:bg-orange-500/4"
                          )}
                        >
                          {/* ID */}
                          <ResizableTableCell columnId="id" className="font-medium text-text-primary">
                            <div className="flex items-center gap-2">
                              {isRendering && (
                                <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500 shrink-0"></span>
                              )}
                              <span className="truncate">{displayId}</span>
                            </div>
                          </ResizableTableCell>

                          {/* Hostname + IP */}
                          <ResizableTableCell columnId="system">
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-mono text-xs text-text-primary truncate">{hostname}</div>
                              <div className="text-[10px] text-text-muted truncate">{ipAddress}</div>
                            </div>
                          </ResizableTableCell>

                          {/* Status - Combined state info */}
                          <ResizableTableCell columnId="status">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Lock-state badge takes precedence */}
                              {isNimbyLocked && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                  <User className="h-2.5 w-2.5" />
                                  In Use
                                </Badge>
                              )}
                              {isLocked && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">
                                  <Lock className="h-2.5 w-2.5" />
                                  Locked
                                </Badge>
                              )}
                              {/* Activity badge — only when OPEN */}
                              {!isLocked && !isNimbyLocked && isUp && isRendering && (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                  Rendering
                                </Badge>
                              )}
                              {!isLocked && !isNimbyLocked && isUp && !isRendering && (
                                <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30">
                                  Available
                                </Badge>
                              )}
                              {!isUp && (
                                <Badge variant="outline" className={cn(stateColors[host.state], "text-[10px]")}>
                                  {host.state}
                                </Badge>
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
                                      if (isNimbyLocked) return "Unlock (CueNimby — student in use)";
                                      if (isLocked) return "Unlock (manually locked)";
                                      return "Lock Host";
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
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        iconButton.settings,
                                        "text-red-400 hover:text-red-600 dark:text-red-400/60 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                      )}
                                      onClick={() => {
                                        setHostToDelete(host);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Delete Host
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
              {/* Host Info Header */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-text-muted">Display ID:</div>
                  <div className="font-medium">{getDisplayIdFromTags(selectedHost.tags || []) || "Unassigned"}</div>
                  <div className="text-text-muted">Hostname:</div>
                  <div className="font-mono font-medium">{selectedHost.hostname?.toUpperCase() || "-"}</div>
                  <div className="text-text-muted">IP Address:</div>
                  <div className="font-mono font-medium">{selectedHost.name}</div>
                </div>
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

      {/* Host Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-red-600 dark:text-red-400">
              Delete Host
            </DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              This will permanently remove the host from OpenCue. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {hostToDelete && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="text-text-muted">Host:</div>
                  <div className="font-mono font-medium text-text-primary">{hostToDelete.name}</div>
                  <div className="text-text-muted">State:</div>
                  <div className="font-medium">{hostToDelete.state}</div>
                  <div className="text-text-muted">Display ID:</div>
                  <div className="font-medium">{getDisplayIdFromTags(hostToDelete.tags || []) || "Unassigned"}</div>
                  <div className="text-text-muted">Cores:</div>
                  <div className="font-medium">{hostToDelete.cores}</div>
                </div>
              </div>

              <p className="text-xs text-text-muted">
                Only delete hosts that are deprecated and no longer part of the render farm. Active hosts will re-register automatically when RQD pings in.
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setHostToDelete(null);
                  }}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteHost}
                  disabled={deleting}
                  className="h-8 text-xs"
                >
                  {deleting ? "Deleting..." : "Delete Host"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
