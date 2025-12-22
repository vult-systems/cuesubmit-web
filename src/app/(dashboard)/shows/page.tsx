"use client";

import { useState, useEffect, useCallback } from "react";
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
  DialogTrigger,
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
  RefreshCw,
  Search,
  Plus,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  Monitor,
  Zap,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { iconButton } from "@/lib/icon-button-styles";
import { GroupedSection } from "@/components/grouped-section";
import { accentColorList } from "@/lib/accent-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Generate semester options (current year +/- 2 years)
function generateSemesterOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const options: { value: string; label: string }[] = [];
  
  for (let year = currentYear + 1; year >= currentYear - 2; year--) {
    const shortYear = year.toString().slice(-2);
    options.push(
      { value: `F${shortYear}`, label: `Fall ${year} (F${shortYear})` },
      { value: `S${shortYear}`, label: `Spring ${year} (S${shortYear})` }
    );
  }
  
  return options;
}

const SEMESTER_OPTIONS = generateSemesterOptions();

interface Show {
  id: string;
  name: string;
  tag?: string;
  description?: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
  bookingEnabled?: boolean;
  semester?: string;
}

interface RoomAllocation {
  id: string;
  name: string;
  tag: string;
  hostCount: number;
  assignedCount: number;
}

interface DebugShow {
  name: string;
  room: string;
  exists: boolean;
  hasAllocation: boolean;
  allocationName?: string;
}

export default function ShowsPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = userRole === "admin";
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showAll] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newShowName, setNewShowName] = useState("");
  const [newShowSemester, setNewShowSemester] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [showToRename, setShowToRename] = useState<Show | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showToDelete, setShowToDelete] = useState<Show | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSubscriptionCount, setDeleteSubscriptionCount] = useState<number | null>(null);
  const [deleteJobCount, setDeleteJobCount] = useState<number | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  // Room allocation state (admin only)
  const [roomAllocations, setRoomAllocations] = useState<RoomAllocation[]>([]);
  const [debugShows, setDebugShows] = useState<DebugShow[]>([]);
  const [loadingRoomData, setLoadingRoomData] = useState(false);
  const [syncingHosts, setSyncingHosts] = useState(false);
  const [creatingDebugShows, setCreatingDebugShows] = useState(false);

  // Fetch user session on mount
  useEffect(() => {
    fetch("/api/auth/session")
      .then(res => res.json())
      .then(data => {
        if (data.isLoggedIn && data.user?.role) {
          setUserRole(data.user.role);
        }
      })
      .catch(err => console.error("Failed to get session:", err));
  }, []);

  const fetchShows = useCallback(async () => {
    try {
      const response = await fetch(`/api/shows${showAll ? "?all=true" : ""}`);
      const data = await response.json();
      if (response.ok) {
        setShows(data.shows || []);
      } else {
        toast.error(data.error || "Failed to fetch shows");
      }
    } catch (error) {
      console.error("Failed to fetch shows:", error);
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    fetchShows();
  }, [fetchShows]);

  // Fetch room allocation data (admin only)
  const fetchRoomData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingRoomData(true);
    try {
      const [allocResponse, debugResponse] = await Promise.all([
        fetch("/api/room-allocations"),
        fetch("/api/debug-shows")
      ]);
      
      if (allocResponse.ok) {
        const allocData = await allocResponse.json();
        setRoomAllocations(allocData.allocations || []);
      }
      
      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        setDebugShows(debugData.debugShows || []);
      }
    } catch (error) {
      console.error("Failed to fetch room data:", error);
    } finally {
      setLoadingRoomData(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchRoomData();
    }
  }, [isAdmin, fetchRoomData]);

  const handleSyncHostsToAllocations = async () => {
    setSyncingHosts(true);
    try {
      const response = await fetch("/api/room-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Synced hosts: ${data.assigned} assigned, ${data.skipped} already correct`);
        if (data.errors > 0) {
          toast.warning(`${data.errors} errors occurred`);
        }
        fetchRoomData();
      } else {
        toast.error(data.error || "Failed to sync hosts");
      }
    } catch (error) {
      console.error("Failed to sync hosts:", error);
      toast.error("Failed to sync hosts to allocations");
    } finally {
      setSyncingHosts(false);
    }
  };

  const handleCreateDebugShows = async () => {
    setCreatingDebugShows(true);
    try {
      const response = await fetch("/api/debug-shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Created ${data.created} debug shows, ${data.subscribed} subscriptions`);
        fetchRoomData();
        fetchShows();
      } else {
        toast.error(data.error || "Failed to create debug shows");
      }
    } catch (error) {
      console.error("Failed to create debug shows:", error);
      toast.error("Failed to create debug shows");
    } finally {
      setCreatingDebugShows(false);
    }
  };

  const handleCreateShow = async () => {
    if (!newShowName.trim()) {
      toast.error("Show name is required");
      return;
    }
    if (!newShowSemester) {
      toast.error("Semester is required");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newShowName.trim(),
          semester: newShowSemester
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Show created successfully");
        setCreateDialogOpen(false);
        setNewShowName("");
        setNewShowSemester("");
        fetchShows();
      } else {
        toast.error(data.error || "Failed to create show");
      }
    } catch (error) {
      console.error("Failed to create show:", error);
      toast.error("Failed to create show");
    } finally {
      setCreating(false);
    }
  };

  const handleShowAction = async (showId: string, action: string, value?: string | number) => {
    try {
      const response = await fetch(`/api/shows/${showId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const data = await response.json();
      if (response.ok) {
        fetchShows();
        return true;
      } else {
        toast.error(data.error || `Failed to ${action} show`);
        return false;
      }
    } catch (error) {
      console.error(`Show ${action} failed:`, error);
      toast.error(`Failed to ${action} show`);
      return false;
    }
  };

  const handleRename = async () => {
    if (!showToRename || !newName.trim()) {
      toast.error("New name is required");
      return;
    }
    setRenaming(true);
    const success = await handleShowAction(showToRename.id, "rename", newName.trim());
    if (success) {
      toast.success("Show renamed");
      setRenameDialogOpen(false);
      setShowToRename(null);
      setNewName("");
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!showToDelete) return;
    setDeleting(true);
    try {
      const url = forceDelete 
        ? `/api/shows/${showToDelete.id}?force=true`
        : `/api/shows/${showToDelete.id}`;
      const response = await fetch(url, { method: "DELETE" });
      const data = await response.json();
      if (response.ok) {
        const message = forceDelete && data.deletedJobs > 0
          ? `Show deleted (${data.deletedJobs} job records removed)`
          : "Show deleted";
        toast.success(message);
        setDeleteDialogOpen(false);
        setShowToDelete(null);
        setForceDelete(false);
        fetchShows();
      } else {
        toast.error(data.error || "Failed to delete show");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete show");
    } finally {
      setDeleting(false);
    }
  };

  const openRenameDialog = (show: Show) => {
    setShowToRename(show);
    setNewName(show.name);
    setRenameDialogOpen(true);
  };

  const openDeleteDialog = async (show: Show) => {
    setShowToDelete(show);
    setDeleteSubscriptionCount(null);
    setDeleteJobCount(null);
    setDeleteDialogOpen(true);
    
    // Fetch stats about what will be deleted
    try {
      const response = await fetch(`/api/shows/${show.id}/stats`);
      const data = await response.json();
      if (response.ok) {
        setDeleteSubscriptionCount(data.subscriptionCount || 0);
        setDeleteJobCount(data.jobCount || 0);
      }
    } catch {
      // Stats fetch failed, but deletion can still proceed
      setDeleteSubscriptionCount(0);
      setDeleteJobCount(0);
    }
  };

  // Filter shows
  const filteredShows = shows.filter((show) =>
    show.name.toLowerCase().includes(globalFilter.toLowerCase())
  );

  // Group shows by semester (DEBUG_* shows go into Debug group)
  const showsBySemester = filteredShows.reduce((acc, show) => {
    const group = show.name.startsWith("DEBUG_") ? "Debug" : (show.semester || "Unknown");
    if (!acc[group]) acc[group] = [];
    acc[group].push(show);
    return acc;
  }, {} as Record<string, Show[]>);

  // Sort semesters (most recent first, Debug at the end, Unknown last)
  const sortedSemesters = Object.keys(showsBySemester).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    if (a === "Debug") return 1;
    if (b === "Debug") return -1;
    const [aSeason, aYear] = [a[0], parseInt(a.slice(1))];
    const [bSeason, bYear] = [b[0], parseInt(b.slice(1))];
    if (aYear !== bYear) return bYear - aYear;
    return aSeason === "F" ? -1 : 1;
  });

  const renderShowRow = (show: Show) => (
    <ResizableTableRow
      key={show.id}
      className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors duration-150 group"
    >
      <ResizableTableCell columnId="name" className="font-medium text-text-primary">
        {show.name}
      </ResizableTableCell>
      <ResizableTableCell columnId="status">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleShowAction(show.id, show.active ? "deactivate" : "activate")}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
                show.active
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                  : "bg-neutral-100 dark:bg-white/5 text-text-muted hover:bg-neutral-200 dark:hover:bg-white/10"
              )}
            >
              {show.active ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
              {show.active ? "Active" : "Inactive"}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to {show.active ? "deactivate" : "activate"}</p>
          </TooltipContent>
        </Tooltip>
      </ResizableTableCell>
      <ResizableTableCell columnId="actions">
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton.edit}
                onClick={() => openRenameDialog(show)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rename</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton.delete}
                onClick={() => openDeleteDialog(show)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </ResizableTableCell>
    </ResizableTableRow>
  );

  const renderTable = (showsList: Show[], storageKey: string) => (
    <ResizableTable storageKey={storageKey}>
      <ResizableTableHeader>
        <ResizableTableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
          <ResizableTableHead columnId="name" minWidth={150} maxWidth={400}>Name</ResizableTableHead>
          <ResizableTableHead columnId="status" minWidth={80} maxWidth={120}>Status</ResizableTableHead>
          <ResizableTableHead columnId="actions" resizable={false} minWidth={80} maxWidth={80} className="text-right">Actions</ResizableTableHead>
        </ResizableTableRow>
      </ResizableTableHeader>
      <ResizableTableBody>
        {showsList.map(renderShowRow)}
      </ResizableTableBody>
    </ResizableTable>
  );

  return (
    <div className="space-y-4">
      <TooltipProvider>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Shows</h1>
            <p className="text-text-muted text-xs mt-1">
              {filteredShows.length} {pluralize(filteredShows.length, "show")} across {sortedSemesters.length} {pluralize(sortedSemesters.length, "semester")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
              <Input
                placeholder="Search shows..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-8 w-64 h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
              />
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 h-8 px-3 text-xs font-medium rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <Plus className="h-3.5 w-3.5" />
                  New Show
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold text-text-primary">Create New Show</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="showSemester" className="text-text-muted text-xs font-medium">
                      Semester <span className="text-red-500">*</span>
                    </Label>
                    <Select value={newShowSemester} onValueChange={setNewShowSemester}>
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 rounded-lg">
                        <SelectValue placeholder="Select semester..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SEMESTER_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="showName" className="text-text-muted text-xs font-medium">
                      Show Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="showName"
                      placeholder="e.g., SeniorThesis"
                      value={newShowName}
                      onChange={(e) => setNewShowName(e.target.value)}
                      className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newShowSemester && newShowName.trim()) handleCreateShow();
                      }}
                    />
                    {newShowName.trim() && newShowSemester && (
                      <p className="text-[10px] text-text-muted">
                        Full name: <span className="font-mono text-text-secondary">{newShowSemester}_{newShowName.trim()}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setCreateDialogOpen(false)}
                      className="h-8 px-4 text-xs hover:bg-white/5 rounded-lg transition-all duration-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateShow}
                      disabled={creating || !newShowName.trim() || !newShowSemester}
                      className="h-8 px-4 text-xs bg-white hover:bg-white/90 text-black font-medium rounded-lg transition-all duration-300"
                    >
                      {creating ? "Creating..." : "Create Show"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setLoading(true);
                fetchShows();
              }}
              disabled={loading}
              className="h-8 w-8 text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-all duration-300"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-text-muted text-xs">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading shows...
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredShows.length === 0 && (
          <div className="text-center py-12 text-text-muted text-sm">
            {globalFilter ? `No shows matching "${globalFilter}"` : "No shows found"}
          </div>
        )}

        {/* Shows grouped by semester */}
        {!loading && sortedSemesters.map((semester, idx) => (
          <GroupedSection
            key={semester}
            title={semester === "Unknown" ? "Unsorted" : semester}
            badge={`${showsBySemester[semester].length} ${pluralize(showsBySemester[semester].length, "show")}`}
            defaultOpen={idx === 0}
            accentColors={accentColorList[idx % accentColorList.length]}
          >
            {renderTable(showsBySemester[semester], `shows-${semester}`)}
          </GroupedSection>
        ))}

        {/* Room Allocations Admin Section */}
        {isAdmin && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary tracking-tight flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Room Allocations
                </h2>
                <p className="text-text-muted text-xs mt-1">
                  Debug shows and host allocations per room (Admin only)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncHostsToAllocations}
                  disabled={syncingHosts}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Zap className={cn("h-3.5 w-3.5", syncingHosts && "animate-pulse")} />
                  {syncingHosts ? "Syncing..." : "Sync Hosts to Room Allocations"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateDebugShows}
                  disabled={creatingDebugShows}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className={cn("h-3.5 w-3.5", creatingDebugShows && "animate-pulse")} />
                  {creatingDebugShows ? "Creating..." : "Create Debug Shows"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchRoomData}
                  disabled={loadingRoomData}
                  className="h-8 w-8"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loadingRoomData && "animate-spin")} />
                </Button>
              </div>
            </div>

            {/* Room Allocation Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {roomAllocations.map((alloc) => {
                const debugShow = debugShows.find(d => d.room.toLowerCase() === alloc.tag?.toLowerCase());
                const isFullySynced = alloc.hostCount > 0 && alloc.assignedCount === alloc.hostCount;
                
                return (
                  <div
                    key={alloc.id || alloc.name}
                    className="p-3 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-text-primary">
                        {alloc.tag?.toUpperCase()}
                      </span>
                      {isFullySynced ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs text-text-muted">
                      <div className="flex justify-between">
                        <span>Hosts with tag:</span>
                        <span className="text-text-secondary">{alloc.hostCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Assigned:</span>
                        <span className={cn(
                          "text-text-secondary",
                          alloc.assignedCount === alloc.hostCount && alloc.hostCount > 0 && "text-emerald-500",
                          alloc.assignedCount < alloc.hostCount && "text-amber-500"
                        )}>
                          {alloc.assignedCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Debug show:</span>
                        <span className={cn(
                          debugShow?.exists ? "text-emerald-500" : "text-amber-500"
                        )}>
                          {debugShow?.exists ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {roomAllocations.length === 0 && !loadingRoomData && (
                <div className="col-span-full text-center py-6 text-text-muted text-sm">
                  No room allocations found. Run the setup script first.
                </div>
              )}
              
              {loadingRoomData && (
                <div className="col-span-full flex items-center justify-center py-6 text-text-muted text-xs">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading room data...
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>How it works:</strong> Hosts are auto-assigned to room allocations based on their tags (e.g., host with tag &quot;AD405&quot; goes to local.ad405 allocation).
                Debug shows like DEBUG_AD405 are subscribed only to their room&apos;s allocation for isolated testing.
              </p>
            </div>
          </div>
        )}

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-text-primary">Rename Show</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="newShowName" className="text-text-muted text-xs font-medium">
                  New Name
                </Label>
                <Input
                  id="newShowName"
                  placeholder="e.g., ProjectBeta"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setRenameDialogOpen(false)}
                  className="h-8 px-4 text-xs hover:bg-white/5 rounded-lg transition-all duration-300"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleRename} 
                  disabled={renaming}
                  className="h-8 px-4 text-xs bg-white hover:bg-white/90 text-black font-medium rounded-lg transition-all duration-300"
                >
                  {renaming ? "Renaming..." : "Rename"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setForceDelete(false);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-text-primary">Delete Show</DialogTitle>
              <DialogDescription className="text-text-muted text-sm">
                Permanently delete &quot;{showToDelete?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {(deleteSubscriptionCount === null || deleteJobCount === null) && (
                <div className="text-xs text-text-muted py-1">Loading show data...</div>
              )}
              
              {deleteSubscriptionCount !== null && deleteSubscriptionCount > 0 && (
                <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 rounded-lg border border-amber-500/20">
                  ⚠️ This show has {deleteSubscriptionCount} {pluralize(deleteSubscriptionCount, "subscription")} that will be deleted.
                </div>
              )}
              
              {deleteJobCount !== null && deleteJobCount > 0 && (
                <div className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg border border-red-500/20">
                  🗄️ This show has <strong>{deleteJobCount}</strong> {pluralize(deleteJobCount, "job")} in history.
                  {!forceDelete && " Enable Force Delete to remove all job history."}
                </div>
              )}
              
              {deleteJobCount !== null && deleteJobCount > 0 && (
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none bg-surface-muted px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-white/10 hover:border-red-500/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={forceDelete}
                    onChange={(e) => setForceDelete(e.target.checked)}
                    className="rounded border-neutral-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-text-secondary">
                    <strong className="text-red-600 dark:text-red-400">Force Delete</strong> — permanently remove all {deleteJobCount} job {pluralize(deleteJobCount ?? 0, "record")} and subscriptions
                  </span>
                </label>
              )}
              
              {deleteJobCount !== null && deleteJobCount === 0 && (
                <div className="text-xs text-text-muted bg-surface-muted px-3 py-2 rounded-lg">
                  ✓ No job history found. This show can be safely deleted.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setForceDelete(false);
                }}
                className="h-8 px-4 text-xs rounded-lg transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting || (deleteJobCount !== null && deleteJobCount > 0 && !forceDelete)}
                variant="destructive"
                className="h-8 px-4 text-xs font-medium rounded-lg transition-all duration-300"
              >
                {deleting && "Deleting..."}
                {!deleting && forceDelete && "Force Delete"}
                {!deleting && !forceDelete && "Delete Show"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </div>
  );
}
