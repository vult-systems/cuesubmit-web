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
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Search,
  Plus,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  Settings,
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
  semester?: string; // e.g., "F25", "S26"
}

interface Subscription {
  id: string;
  name: string;
  showName: string;
  facility: string;
  allocationName: string;
  size: number;
  burst: number;
  reservedCores: number;
  reservedGpus: number;
}

export default function ShowsPage() {
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
  
  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [showToEdit, setShowToEdit] = useState<Show | null>(null);
  const [minCores, setMinCores] = useState(1);
  const [maxCores, setMaxCores] = useState(4);
  const [editSemester, setEditSemester] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [allocations, setAllocations] = useState<{ id: string; name: string }[]>([]);
  const [editingSubscription, setEditingSubscription] = useState<string | null>(null);
  const [editSize, setEditSize] = useState(0);
  const [editBurst, setEditBurst] = useState(100);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [newSubAllocation, setNewSubAllocation] = useState("");

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

  useEffect(() => {
    fetchShows();
    fetchAllocations();
  }, [fetchShows, fetchAllocations]);

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
        toast.success(`Show ${action} successful`);
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
      const response = await fetch(url, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        const message = forceDelete && data.deletedJobs > 0
          ? `Show deleted successfully (${data.deletedJobs} job records removed)`
          : "Show deleted successfully";
        toast.success(message);
        setDeleteDialogOpen(false);
        setShowToDelete(null);
        setForceDelete(false);
        fetchShows();
      } else {
        toast.error(data.error || "Failed to delete show");
      }
    } catch (error) {
      console.error("Failed to delete show:", error);
      toast.error("Failed to delete show");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!showToEdit) return;
    setSavingSettings(true);
    
    let success = true;
    
    // Save semester if changed
    if (editSemester !== (showToEdit.semester || "")) {
      try {
        const response = await fetch(`/api/shows/${showToEdit.id}/semester`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ semester: editSemester || null }),
        });
        if (!response.ok) {
          toast.error("Failed to update semester");
          success = false;
        }
      } catch {
        toast.error("Failed to update semester");
        success = false;
      }
    }
    
    if (success && minCores !== showToEdit.defaultMinCores) {
      success = await handleShowAction(showToEdit.id, "setMinCores", minCores);
    }
    if (success && maxCores !== showToEdit.defaultMaxCores) {
      success = await handleShowAction(showToEdit.id, "setMaxCores", maxCores);
    }
    
    if (success) {
      setSettingsDialogOpen(false);
      setShowToEdit(null);
      fetchShows(); // Refresh to get updated semester
    }
    setSavingSettings(false);
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
    setForceDelete(false);
    setDeleteDialogOpen(true);
    
    // Fetch stats for the show (subscriptions and job history)
    try {
      const [subsResponse, statsResponse] = await Promise.all([
        fetch(`/api/shows/${show.id}/subscriptions`),
        fetch(`/api/shows/${show.id}/stats`),
      ]);
      
      if (subsResponse.ok) {
        const subsData = await subsResponse.json();
        setDeleteSubscriptionCount(subsData.subscriptions?.length || 0);
      }
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setDeleteJobCount(statsData.jobCount || 0);
      }
    } catch {
      setDeleteSubscriptionCount(0);
      setDeleteJobCount(0);
    }
  };

  const fetchSubscriptions = async (showId: string) => {
    setLoadingSubscriptions(true);
    try {
      const response = await fetch(`/api/shows/${showId}/subscriptions`);
      const data = await response.json();
      if (response.ok) {
        setSubscriptions(data.subscriptions || []);
      } else {
        setSubscriptions([]);
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
      setSubscriptions([]);
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  const handleAddSubscription = async () => {
    if (!showToEdit || !newSubAllocation) return;
    
    setAddingSubscription(true);
    try {
      const response = await fetch(`/api/shows/${showToEdit.id}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocationId: newSubAllocation,
          size: 0,
          burst: 100,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Subscription created");
        setNewSubAllocation("");
        fetchSubscriptions(showToEdit.id);
      } else {
        toast.error(data.error || "Failed to create subscription");
      }
    } catch (error) {
      console.error("Failed to create subscription:", error);
      toast.error("Failed to create subscription");
    } finally {
      setAddingSubscription(false);
    }
  };

  const handleUpdateSubscription = async (subscriptionId: string) => {
    if (!showToEdit) return;
    
    setSavingSubscription(true);
    try {
      const response = await fetch(`/api/shows/${showToEdit.id}/subscriptions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          size: editSize,
          burst: editBurst,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Subscription updated");
        setEditingSubscription(null);
        fetchSubscriptions(showToEdit.id);
      } else {
        toast.error(data.error || "Failed to update subscription");
      }
    } catch (error) {
      console.error("Failed to update subscription:", error);
      toast.error("Failed to update subscription");
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleDeleteSubscription = async (subscriptionId: string) => {
    if (!showToEdit) return;
    
    try {
      const response = await fetch(
        `/api/shows/${showToEdit.id}/subscriptions?subscriptionId=${subscriptionId}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (response.ok) {
        toast.success("Subscription removed");
        fetchSubscriptions(showToEdit.id);
      } else {
        toast.error(data.error || "Failed to remove subscription");
      }
    } catch (error) {
      console.error("Failed to delete subscription:", error);
      toast.error("Failed to remove subscription");
    }
  };

  const startEditSubscription = (sub: Subscription) => {
    setEditingSubscription(sub.id);
    setEditSize(sub.size);
    setEditBurst(sub.burst);
  };

  const openSettingsDialog = (show: Show) => {
    setShowToEdit(show);
    setMinCores(show.defaultMinCores);
    setMaxCores(show.defaultMaxCores);
    setEditSemester(show.semester || "");
    setSubscriptions([]);
    setEditingSubscription(null);
    setNewSubAllocation("");
    setSettingsDialogOpen(true);
    fetchSubscriptions(show.id);
  };

  // Get allocations that don't have subscriptions yet
  const availableAllocations = allocations.filter(
    (alloc) => !subscriptions.some((sub) => sub.allocationName === alloc.name)
  );

  // Filter shows
  const filteredShows = shows.filter((show) =>
    show.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
    (show.description || "").toLowerCase().includes(globalFilter.toLowerCase())
  );

  // Get semester sort order (most recent first)
  const getSemesterOrder = (semester: string): number => {
    if (!semester || semester === "UNASSIGNED") return -1;
    const regex = /^([FS])(\d{2})$/i;
    const match = regex.exec(semester);
    if (!match) return -1;
    const season = match[1].toUpperCase();
    const year = Number.parseInt(match[2], 10);
    // Higher year = higher priority, Fall > Spring within same year
    return year * 10 + (season === "F" ? 1 : 0);
  };

  // Group by semester
  const showsBySemester = filteredShows.reduce((acc, show) => {
    const semester = show.semester?.toUpperCase() || "UNASSIGNED";
    if (!acc[semester]) acc[semester] = [];
    acc[semester].push(show);
    return acc;
  }, {} as Record<string, Show[]>);

  // Sort semesters (most recent first, UNASSIGNED last)
  const sortedSemesters = Object.keys(showsBySemester).sort(
    (a, b) => getSemesterOrder(b) - getSemesterOrder(a)
  );

  // Get full semester name for display
  const getSemesterLabel = (semester: string): string => {
    if (!semester || semester === "UNASSIGNED") return "UNASSIGNED";
    const regex = /^([FS])(\d{2})$/i;
    const match = regex.exec(semester);
    if (!match) return semester;
    const season = match[1].toUpperCase() === "F" ? "FALL" : "SPRING";
    const year = `20${match[2]}`;
    return `${season} ${year}`;
  };

  const renderShowRow = (show: Show) => (
    <ResizableTableRow
      key={show.id}
      className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors duration-150 group"
    >
      <ResizableTableCell columnId="name" className="font-medium text-text-primary">
        {show.name}
      </ResizableTableCell>
      <ResizableTableCell columnId="subscription">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-text-muted hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5"
          onClick={() => openSettingsDialog(show)}
        >
          View
        </Button>
      </ResizableTableCell>
      <ResizableTableCell columnId="status">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            show.active
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-surface-muted text-text-muted border-border"
          )}
        >
          {show.active ? "Active" : "Inactive"}
        </Badge>
      </ResizableTableCell>
      <ResizableTableCell columnId="min" className="text-text-muted text-xs">
        {show.defaultMinCores}
      </ResizableTableCell>
      <ResizableTableCell columnId="max" className="text-text-secondary text-xs">
        {show.defaultMaxCores}
      </ResizableTableCell>
      <ResizableTableCell columnId="booking">
        <span className={cn(
          "text-xs font-medium",
          show.bookingEnabled ? "text-emerald-500" : "text-text-muted"
        )}>
          {show.bookingEnabled ? "Yes" : "No"}
        </span>
      </ResizableTableCell>
      <ResizableTableCell columnId="actions">
        <div className="flex items-center justify-end gap-0.5">
          {/* Activate/Deactivate Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={show.active ? iconButton.activate : iconButton.settings}
                onClick={() => handleShowAction(show.id, show.active ? "deactivate" : "activate")}
              >
                {show.active ? (
                  <Power className="h-3.5 w-3.5" />
                ) : (
                  <PowerOff className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{show.active ? "Deactivate" : "Activate"}</p>
            </TooltipContent>
          </Tooltip>

          {/* Rename */}
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

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton.settings}
                onClick={() => openSettingsDialog(show)}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>

          {/* Delete */}
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
          <ResizableTableHead columnId="name" minWidth={100} maxWidth={300}>Name</ResizableTableHead>
          <ResizableTableHead columnId="subscription" minWidth={80} maxWidth={120}>Subscription</ResizableTableHead>
          <ResizableTableHead columnId="status" minWidth={70} maxWidth={100}>Status</ResizableTableHead>
          <ResizableTableHead columnId="min" minWidth={50} maxWidth={80}>Min</ResizableTableHead>
          <ResizableTableHead columnId="max" minWidth={50} maxWidth={80}>Max</ResizableTableHead>
          <ResizableTableHead columnId="booking" minWidth={60} maxWidth={100}>Booking</ResizableTableHead>
          <ResizableTableHead columnId="actions" resizable={false} minWidth={120} maxWidth={120} className="text-right">Actions</ResizableTableHead>
        </ResizableTableRow>
      </ResizableTableHeader>
      <ResizableTableBody>
        {showsList.map(renderShowRow)}
      </ResizableTableBody>
    </ResizableTable>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Shows</h1>
          <p className="text-text-muted text-xs mt-1">
            {filteredShows.length} {pluralize(filteredShows.length, 'show')} across {sortedSemesters.length} {pluralize(sortedSemesters.length, 'semester')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-text-primary transition-colors duration-300" />
            <Input
              placeholder="e.g., MyShow"
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
                    <p className="text-xs text-text-muted mt-1">
                      Full name: <span className="font-mono text-text-secondary">{newShowName.trim()}_{newShowSemester}</span>
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
                    disabled={creating || !newShowSemester || !newShowName.trim()}
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
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-neutral-300 dark:border-white/20 border-t-neutral-700 dark:border-t-white rounded-full animate-spin" />
          <span className="text-text-muted text-sm">Loading shows...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredShows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <span className="text-text-muted">No shows found</span>
          <span className="text-text-muted/50 text-xs">Create a new show to get started</span>
        </div>
      )}

      {/* Grouped Sections */}
      {!loading && filteredShows.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <div className="space-y-3">
            {sortedSemesters.map((semester, index) => (
              <GroupedSection
                key={semester}
                title={getSemesterLabel(semester)}
                badge={`${showsBySemester[semester].length}`}
                accentColors={accentColorList[index % accentColorList.length]}
                defaultOpen={true}
              >
                {renderTable(showsBySemester[semester], `shows-${semester}`)}
              </GroupedSection>
            ))}
          </div>
        </TooltipProvider>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Rename Show</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Rename &quot;{showToRename?.name}&quot; to a new name.
            </DialogDescription>
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
            {/* Stats loading */}
            {(deleteSubscriptionCount === null || deleteJobCount === null) && (
              <div className="text-xs text-text-muted py-1">Loading show data...</div>
            )}
            
            {/* Subscription warning */}
            {deleteSubscriptionCount !== null && deleteSubscriptionCount > 0 && (
              <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 rounded-lg border border-amber-500/20">
                ⚠️ This show has {deleteSubscriptionCount} {pluralize(deleteSubscriptionCount, 'subscription')} that will be deleted.
              </div>
            )}
            
            {/* Job history warning */}
            {deleteJobCount !== null && deleteJobCount > 0 && (
              <div className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg border border-red-500/20">
                🗄️ This show has <strong>{deleteJobCount}</strong> {pluralize(deleteJobCount, 'job')} in history.
                {!forceDelete && " Enable Force Delete to remove all job history."}
              </div>
            )}
            
            {/* Force delete option - only show if there's job history */}
            {deleteJobCount !== null && deleteJobCount > 0 && (
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none bg-surface-muted px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-white/10 hover:border-red-500/30 transition-colors">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="rounded border-neutral-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-text-secondary">
                  <strong className="text-red-600 dark:text-red-400">Force Delete</strong> — permanently remove all {deleteJobCount} job {pluralize(deleteJobCount ?? 0, 'record')} and subscriptions
                </span>
              </label>
            )}
            
            {/* Info note when no job history */}
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

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Show Settings</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Settings for &quot;{showToEdit?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="editSemester" className="text-text-muted text-xs font-medium">
                Semester
              </Label>
              <Select value={editSemester || "none"} onValueChange={(v) => setEditSemester(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 rounded-lg">
                  <SelectValue placeholder="Select semester..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs text-text-muted">
                    No semester assigned
                  </SelectItem>
                  {SEMESTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="minCores" className="text-text-muted text-xs font-medium">
                  Default Min Cores
                </Label>
                <Input
                  id="minCores"
                  type="number"
                  min={0}
                  value={minCores}
                  onChange={(e) => setMinCores(Number.parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxCores" className="text-text-muted text-xs font-medium">
                  Default Max Cores
                </Label>
                <Input
                  id="maxCores"
                  type="number"
                  min={0}
                  value={maxCores}
                  onChange={(e) => setMaxCores(Number.parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                />
              </div>
            </div>
            
            {/* Subscriptions Section */}
            <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-white/8">
              <div className="flex items-center justify-between">
                <Label className="text-text-muted text-xs font-medium">
                  Room Subscriptions ({loadingSubscriptions ? "..." : subscriptions.length})
                </Label>
              </div>
              
              <p className="text-[10px] text-text-muted">
                Subscriptions control which render rooms this show can use. Set <strong>Size</strong> for guaranteed cores, 
                <strong> Burst</strong> for maximum when available.
              </p>
              
              {loadingSubscriptions && (
                <div className="text-xs text-text-muted py-2">Loading subscriptions...</div>
              )}
              
              {!loadingSubscriptions && subscriptions.length === 0 && (
                <div className="text-xs text-text-muted py-2 px-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded">
                  ⚠️ No subscriptions. This show cannot render until you add room subscriptions below.
                </div>
              )}
              
              {!loadingSubscriptions && subscriptions.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 text-xs bg-surface-muted px-3 py-2 rounded-lg"
                    >
                      <span className="text-text-primary font-medium min-w-24">{sub.allocationName}</span>
                      
                      {editingSubscription === sub.id ? (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-text-muted text-[10px]">Size:</span>
                            <Input
                              type="number"
                              min={0}
                              value={editSize}
                              onChange={(e) => setEditSize(Number.parseInt(e.target.value, 10) || 0)}
                              className="h-6 w-16 text-xs px-1.5"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-text-muted text-[10px]">Burst:</span>
                            <Input
                              type="number"
                              min={0}
                              value={editBurst}
                              onChange={(e) => setEditBurst(Number.parseInt(e.target.value, 10) || 0)}
                              className="h-6 w-16 text-xs px-1.5"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateSubscription(sub.id)}
                            disabled={savingSubscription}
                            className="h-6 px-2 text-[10px]"
                          >
                            {savingSubscription ? "..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSubscription(null)}
                            className="h-6 px-2 text-[10px]"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-text-muted flex-1">
                            Size: <span className="text-text-secondary">{sub.size}</span> / 
                            Burst: <span className="text-text-secondary">{sub.burst}</span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditSubscription(sub)}
                            className="h-6 px-2 text-[10px] hover:bg-white/50 dark:hover:bg-white/10"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteSubscription(sub.id)}
                            className="h-6 px-2 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Subscription */}
              {!loadingSubscriptions && availableAllocations.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <Select value={newSubAllocation} onValueChange={setNewSubAllocation}>
                    <SelectTrigger className="h-8 text-xs flex-1 bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 rounded-lg">
                      <SelectValue placeholder="Add room subscription..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAllocations.map((alloc) => (
                        <SelectItem key={alloc.id} value={alloc.id} className="text-xs">
                          {alloc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleAddSubscription}
                    disabled={!newSubAllocation || addingSubscription}
                    className="h-8 px-3 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {addingSubscription ? "Adding..." : "Add"}
                  </Button>
                </div>
              )}
              
              {!loadingSubscriptions && availableAllocations.length === 0 && subscriptions.length > 0 && (
                <div className="text-[10px] text-text-muted">
                  ✓ Subscribed to all available rooms
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setSettingsDialogOpen(false)}
                className="h-8 px-4 text-xs rounded-lg transition-all duration-300"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveSettings} 
                disabled={savingSettings}
                className="h-8 px-4 text-xs font-medium rounded-lg transition-all duration-300"
              >
                {savingSettings ? "Saving..." : "Save Settings"}}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
