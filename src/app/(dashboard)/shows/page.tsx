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
  ChevronDown,
  ChevronRight,
  Check,
  X,
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
  
  // Expanded rows for subscriptions
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [showSubscriptions, setShowSubscriptions] = useState<Record<string, Subscription[]>>({});
  const [loadingSubscriptions, setLoadingSubscriptions] = useState<Set<string>>(new Set());
  
  // Inline editing state
  const [editingField, setEditingField] = useState<{ showId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string | number>("");
  const [saving, setSaving] = useState(false);
  
  // Subscription editing
  const [editingSubscription, setEditingSubscription] = useState<string | null>(null);
  const [editSubSize, setEditSubSize] = useState(0);
  const [editSubBurst, setEditSubBurst] = useState(100);
  const [savingSubscription, setSavingSubscription] = useState(false);
  
  // Allocations for adding subscriptions
  const [allocations, setAllocations] = useState<{ id: string; name: string }[]>([]);
  const [addingSubToShow, setAddingSubToShow] = useState<string | null>(null);
  const [newSubAllocation, setNewSubAllocation] = useState("");
  const [addingSubscription, setAddingSubscription] = useState(false);

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

  const fetchSubscriptions = async (showId: string) => {
    setLoadingSubscriptions((prev) => new Set(prev).add(showId));
    try {
      const response = await fetch(`/api/shows/${showId}/subscriptions`);
      const data = await response.json();
      if (response.ok) {
        setShowSubscriptions((prev) => ({
          ...prev,
          [showId]: data.subscriptions || [],
        }));
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
    } finally {
      setLoadingSubscriptions((prev) => {
        const next = new Set(prev);
        next.delete(showId);
        return next;
      });
    }
  };

  const toggleExpanded = (showId: string) => {
    setExpandedShows((prev) => {
      const next = new Set(prev);
      if (next.has(showId)) {
        next.delete(showId);
      } else {
        next.add(showId);
        // Fetch subscriptions if not already loaded
        if (!showSubscriptions[showId]) {
          fetchSubscriptions(showId);
        }
      }
      return next;
    });
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
      console.error("Failed to delete show:", error);
      toast.error("Failed to delete show");
    } finally {
      setDeleting(false);
    }
  };

  // Inline field editing
  const startEditing = (showId: string, field: string, currentValue: string | number) => {
    setEditingField({ showId, field });
    setEditValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveInlineEdit = async () => {
    if (!editingField) return;
    setSaving(true);
    
    const { showId, field } = editingField;
    let success = false;
    
    if (field === "minCores") {
      success = await handleShowAction(showId, "setMinCores", Number(editValue));
    } else if (field === "maxCores") {
      success = await handleShowAction(showId, "setMaxCores", Number(editValue));
    } else if (field === "semester") {
      try {
        const response = await fetch(`/api/shows/${showId}/semester`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ semester: editValue || null }),
        });
        success = response.ok;
        if (success) fetchShows();
      } catch {
        success = false;
      }
    }
    
    if (success) {
      toast.success(`Updated ${field}`);
    }
    setSaving(false);
    cancelEditing();
  };

  // Subscription editing
  const startEditSubscription = (sub: Subscription) => {
    setEditingSubscription(sub.id);
    setEditSubSize(sub.size);
    setEditSubBurst(sub.burst);
  };

  const handleUpdateSubscription = async (showId: string, subscriptionId: string) => {
    setSavingSubscription(true);
    try {
      const response = await fetch(`/api/shows/${showId}/subscriptions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          size: editSubSize,
          burst: editSubBurst,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Subscription updated");
        setEditingSubscription(null);
        fetchSubscriptions(showId);
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

  const handleDeleteSubscription = async (showId: string, subscriptionId: string) => {
    try {
      const response = await fetch(
        `/api/shows/${showId}/subscriptions?subscriptionId=${subscriptionId}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (response.ok) {
        toast.success("Subscription removed");
        fetchSubscriptions(showId);
      } else {
        toast.error(data.error || "Failed to remove subscription");
      }
    } catch (error) {
      console.error("Failed to delete subscription:", error);
      toast.error("Failed to remove subscription");
    }
  };

  const handleAddSubscription = async (showId: string) => {
    if (!newSubAllocation) return;
    
    setAddingSubscription(true);
    try {
      const response = await fetch(`/api/shows/${showId}/subscriptions`, {
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
        toast.success("Subscription added");
        setNewSubAllocation("");
        setAddingSubToShow(null);
        fetchSubscriptions(showId);
      } else {
        toast.error(data.error || "Failed to add subscription");
      }
    } catch (error) {
      console.error("Failed to add subscription:", error);
      toast.error("Failed to add subscription");
    } finally {
      setAddingSubscription(false);
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
    setForceDelete(false);
    setDeleteDialogOpen(true);
    
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

  // Get allocations not yet subscribed for a show
  const getAvailableAllocations = (showId: string) => {
    const subs = showSubscriptions[showId] || [];
    return allocations.filter(
      (alloc) => !subs.some((sub) => sub.allocationName === alloc.name)
    );
  };

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
    return year * 10 + (season === "F" ? 1 : 0);
  };

  // Group by semester
  const showsBySemester = filteredShows.reduce((acc, show) => {
    const semester = show.semester?.toUpperCase() || "UNASSIGNED";
    if (!acc[semester]) acc[semester] = [];
    acc[semester].push(show);
    return acc;
  }, {} as Record<string, Show[]>);

  const sortedSemesters = Object.keys(showsBySemester).sort(
    (a, b) => getSemesterOrder(b) - getSemesterOrder(a)
  );

  const getSemesterLabel = (semester: string): string => {
    if (!semester || semester === "UNASSIGNED") return "UNASSIGNED";
    const regex = /^([FS])(\d{2})$/i;
    const match = regex.exec(semester);
    if (!match) return semester;
    const season = match[1].toUpperCase() === "F" ? "FALL" : "SPRING";
    const year = `20${match[2]}`;
    return `${season} ${year}`;
  };

  const renderEditableCell = (
    show: Show,
    field: string,
    value: string | number,
    type: "number" | "text" = "number"
  ) => {
    const isEditing = editingField?.showId === show.id && editingField?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(type === "number" ? Number(e.target.value) : e.target.value)}
            className="h-6 w-16 text-xs px-1.5"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveInlineEdit();
              if (e.key === "Escape") cancelEditing();
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
            onClick={saveInlineEdit}
            disabled={saving}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
            onClick={cancelEditing}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }
    
    return (
      <button
        type="button"
        onClick={() => startEditing(show.id, field, value)}
        className="text-xs text-text-secondary hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-white/5 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
      >
        {value}
      </button>
    );
  };

  const renderSubscriptionRow = (show: Show) => {
    const subs = showSubscriptions[show.id] || [];
    const isLoading = loadingSubscriptions.has(show.id);
    const availableAllocs = getAvailableAllocations(show.id);
    
    return (
      <tr key={`${show.id}-subs`} className="bg-neutral-50/50 dark:bg-white/[0.02]">
        <td colSpan={7} className="px-3 py-2">
          <div className="pl-6 space-y-2">
            {isLoading && (
              <div className="text-xs text-text-muted">Loading subscriptions...</div>
            )}
            
            {!isLoading && subs.length === 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 rounded border border-amber-200 dark:border-amber-500/20">
                ⚠️ No room subscriptions — this show cannot render
              </div>
            )}
            
            {!isLoading && subs.length > 0 && (
              <div className="grid gap-1">
                {subs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 text-xs bg-white dark:bg-white/5 px-2 py-1.5 rounded border border-neutral-200 dark:border-white/10"
                  >
                    <span className="font-medium text-text-primary min-w-20">{sub.allocationName}</span>
                    
                    {editingSubscription === sub.id ? (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-text-muted">Size:</span>
                          <Input
                            type="number"
                            min={0}
                            value={editSubSize}
                            onChange={(e) => setEditSubSize(Number(e.target.value) || 0)}
                            className="h-5 w-14 text-xs px-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-text-muted">Burst:</span>
                          <Input
                            type="number"
                            min={0}
                            value={editSubBurst}
                            onChange={(e) => setEditSubBurst(Number(e.target.value) || 0)}
                            className="h-5 w-14 text-xs px-1"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateSubscription(show.id, sub.id)}
                          disabled={savingSubscription}
                          className="h-5 px-2 text-[10px]"
                        >
                          {savingSubscription ? "..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingSubscription(null)}
                          className="h-5 px-2 text-[10px]"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-text-muted">
                          Size: <span className="text-text-secondary font-medium">{sub.size}</span>
                        </span>
                        <span className="text-text-muted">
                          Burst: <span className="text-text-secondary font-medium">{sub.burst}</span>
                        </span>
                        {sub.reservedCores > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {sub.reservedCores} cores in use
                          </span>
                        )}
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditSubscription(sub)}
                          className="h-5 px-1.5 text-text-muted hover:text-text-primary"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSubscription(show.id, sub.id)}
                          className="h-5 px-1.5 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Add subscription */}
            {!isLoading && availableAllocs.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                {addingSubToShow === show.id ? (
                  <>
                    <Select value={newSubAllocation} onValueChange={setNewSubAllocation}>
                      <SelectTrigger className="h-6 text-xs w-40 bg-white dark:bg-white/5">
                        <SelectValue placeholder="Select room..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAllocs.map((alloc) => (
                          <SelectItem key={alloc.id} value={alloc.id} className="text-xs">
                            {alloc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => handleAddSubscription(show.id)}
                      disabled={!newSubAllocation || addingSubscription}
                      className="h-6 px-2 text-xs"
                    >
                      {addingSubscription ? "..." : "Add"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddingSubToShow(null);
                        setNewSubAllocation("");
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddingSubToShow(show.id)}
                    className="h-6 px-2 text-xs text-text-muted hover:text-text-primary"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Room
                  </Button>
                )}
              </div>
            )}
            
            {!isLoading && availableAllocs.length === 0 && subs.length > 0 && (
              <div className="text-[10px] text-text-muted">
                ✓ Subscribed to all available rooms
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderShowRow = (show: Show) => {
    const isExpanded = expandedShows.has(show.id);
    const subs = showSubscriptions[show.id] || [];
    const subCount = isExpanded ? subs.length : null;
    
    return (
      <>
        <ResizableTableRow
          key={show.id}
          className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-colors duration-150 group"
        >
          <ResizableTableCell columnId="expand" className="w-8">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-text-muted hover:text-text-primary"
              onClick={() => toggleExpanded(show.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
          </ResizableTableCell>
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
          <ResizableTableCell columnId="min">
            {renderEditableCell(show, "minCores", show.defaultMinCores)}
          </ResizableTableCell>
          <ResizableTableCell columnId="max">
            {renderEditableCell(show, "maxCores", show.defaultMaxCores)}
          </ResizableTableCell>
          <ResizableTableCell columnId="subs" className="text-xs text-text-muted">
            {subCount !== null ? (
              <span>{subCount} {pluralize(subCount, "room")}</span>
            ) : (
              <button
                type="button"
                onClick={() => toggleExpanded(show.id)}
                className="text-text-muted hover:text-text-primary hover:underline cursor-pointer"
              >
                View
              </button>
            )}
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
        {isExpanded && renderSubscriptionRow(show)}
      </>
    );
  };

  const renderTable = (showsList: Show[], storageKey: string) => (
    <ResizableTable storageKey={storageKey}>
      <ResizableTableHeader>
        <ResizableTableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
          <ResizableTableHead columnId="expand" resizable={false} minWidth={32} maxWidth={32} />
          <ResizableTableHead columnId="name" minWidth={100} maxWidth={300}>Name</ResizableTableHead>
          <ResizableTableHead columnId="status" minWidth={80} maxWidth={120}>Status</ResizableTableHead>
          <ResizableTableHead columnId="min" minWidth={50} maxWidth={80}>Min Cores</ResizableTableHead>
          <ResizableTableHead columnId="max" minWidth={50} maxWidth={80}>Max Cores</ResizableTableHead>
          <ResizableTableHead columnId="subs" minWidth={80} maxWidth={120}>Subscriptions</ResizableTableHead>
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
    </div>
  );
}
