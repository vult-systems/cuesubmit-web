"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { iconButton } from "@/lib/icon-button-styles";
import { GroupedSection } from "@/components/grouped-section";
import { accentColorList } from "@/lib/accent-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [showAll, setShowAll] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newShowName, setNewShowName] = useState("");
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
  
  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [showToEdit, setShowToEdit] = useState<Show | null>(null);
  const [minCores, setMinCores] = useState(1);
  const [maxCores, setMaxCores] = useState(4);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);

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

  const handleCreateShow = async () => {
    if (!newShowName.trim()) {
      toast.error("Show name is required");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShowName.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Show created successfully");
        setCreateDialogOpen(false);
        setNewShowName("");
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
      const response = await fetch(`/api/shows/${showToDelete.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Show deleted successfully");
        setDeleteDialogOpen(false);
        setShowToDelete(null);
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
    if (minCores !== showToEdit.defaultMinCores) {
      success = await handleShowAction(showToEdit.id, "setMinCores", minCores);
    }
    if (success && maxCores !== showToEdit.defaultMaxCores) {
      success = await handleShowAction(showToEdit.id, "setMaxCores", maxCores);
    }
    
    if (success) {
      setSettingsDialogOpen(false);
      setShowToEdit(null);
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
    setDeleteDialogOpen(true);
    // Fetch subscription count for the show
    try {
      const response = await fetch(`/api/shows/${show.id}/subscriptions`);
      const data = await response.json();
      if (response.ok) {
        setDeleteSubscriptionCount(data.subscriptions?.length || 0);
      }
    } catch {
      setDeleteSubscriptionCount(0);
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

  const openSettingsDialog = (show: Show) => {
    setShowToEdit(show);
    setMinCores(show.defaultMinCores);
    setMaxCores(show.defaultMaxCores);
    setSubscriptions([]);
    setSettingsDialogOpen(true);
    fetchSubscriptions(show.id);
  };

  // Filter shows
  const filteredShows = shows.filter((show) =>
    show.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
    (show.description || "").toLowerCase().includes(globalFilter.toLowerCase())
  );

  // Get semester sort order (most recent first)
  const getSemesterOrder = (semester: string): number => {
    if (!semester || semester === "UNASSIGNED") return -1;
    const match = semester.match(/^([FS])(\d{2})$/i);
    if (!match) return -1;
    const season = match[1].toUpperCase();
    const year = parseInt(match[2]);
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
    const match = semester.match(/^([FS])(\d{2})$/i);
    if (!match) return semester;
    const season = match[1].toUpperCase() === "F" ? "FALL" : "SPRING";
    const year = `20${match[2]}`;
    return `${season} ${year}`;
  };

  const renderShowRow = (show: Show) => (
    <TableRow
      key={show.id}
      className="hover:bg-neutral-50 dark:hover:bg-white/3 transition-all duration-200 group border-neutral-200 dark:border-white/6"
    >
      <TableCell className="pl-8 font-medium text-text-primary text-sm">
        {show.name}
      </TableCell>
      <TableCell className="text-center">
        <span className="font-mono text-xs text-text-muted bg-surface-muted px-1.5 py-0.5 rounded">
          {show.tag || "-"}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            show.active
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-surface-muted text-text-muted border-border"
          )}
        >
          {show.active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-text-muted text-sm text-center">
        {show.defaultMinCores}
      </TableCell>
      <TableCell className="text-text-secondary text-sm text-center">
        {show.defaultMaxCores}
      </TableCell>
      <TableCell className="text-center">
        <span className={cn(
          "text-xs font-medium",
          show.bookingEnabled ? "text-emerald-500" : "text-text-muted"
        )}>
          {show.bookingEnabled ? "Yes" : "No"}
        </span>
      </TableCell>
      <TableCell className="pr-8">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center justify-center gap-0.5">
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
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );

  const renderTable = (showsList: Show[]) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-neutral-200 dark:border-white/6">
          <TableHead className="pl-8">Name</TableHead>
          <TableHead className="text-center">Tag</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-center">Min</TableHead>
          <TableHead className="text-center">Max</TableHead>
          <TableHead className="text-center">Booking</TableHead>
          <TableHead className="text-center pr-8">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {showsList.map(renderShowRow)}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Shows</h1>
          <p className="text-text-muted text-xs mt-1">
            {filteredShows.length} show{filteredShows.length !== 1 ? "s" : ""} across {sortedSemesters.length} semester{sortedSemesters.length !== 1 ? "s" : ""}
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
                  <Label htmlFor="showName" className="text-text-muted text-xs font-medium">
                    Show Name
                  </Label>
                  <Input
                    id="showName"
                    placeholder="e.g., ProjectAlpha"
                    value={newShowName}
                    onChange={(e) => setNewShowName(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateShow();
                    }}
                  />
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
                    disabled={creating}
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
        <div className="space-y-3">
          {sortedSemesters.map((semester, index) => (
            <GroupedSection
              key={semester}
              title={getSemesterLabel(semester)}
              badge={`${showsBySemester[semester].length}`}
              accentColors={accentColorList[index % accentColorList.length]}
              defaultOpen={true}
            >
              {renderTable(showsBySemester[semester])}
            </GroupedSection>
          ))}
        </div>
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Delete Show</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Permanently delete &quot;{showToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {deleteSubscriptionCount !== null && deleteSubscriptionCount > 0 && (
              <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 rounded-lg border border-amber-500/20">
                ⚠️ This show has {deleteSubscriptionCount} subscription{deleteSubscriptionCount !== 1 ? 's' : ''} that will also be deleted.
              </div>
            )}
            <div className="text-xs text-text-muted bg-surface-muted px-3 py-2 rounded-lg">
              <strong>Note:</strong> Shows with job history cannot be deleted. If deletion fails, try deactivating the show instead.
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="h-8 px-4 text-xs rounded-lg transition-all duration-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              variant="destructive"
              className="h-8 px-4 text-xs font-medium rounded-lg transition-all duration-300"
            >
              {deleting ? "Deleting..." : "Delete Show"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text-primary">Show Settings</DialogTitle>
            <DialogDescription className="text-text-muted text-sm">
              Default render settings for &quot;{showToEdit?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="minCores" className="text-text-muted text-xs font-medium">
                Default Min Cores
              </Label>
              <Input
                id="minCores"
                type="number"
                min={0}
                value={minCores}
                onChange={(e) => setMinCores(parseInt(e.target.value) || 0)}
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
                onChange={(e) => setMaxCores(parseInt(e.target.value) || 0)}
                className="h-8 text-xs bg-white dark:bg-white/3 border-neutral-200 dark:border-white/8 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-neutral-50 dark:focus:bg-white/5 rounded-lg transition-all duration-300"
              />
            </div>
            
            {/* Subscriptions Section */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-white/8">
              <Label className="text-text-muted text-xs font-medium">
                Subscriptions ({loadingSubscriptions ? "..." : subscriptions.length})
              </Label>
              {loadingSubscriptions ? (
                <div className="text-xs text-text-muted py-2">Loading subscriptions...</div>
              ) : subscriptions.length === 0 ? (
                <div className="text-xs text-text-muted py-2">No subscriptions for this show.</div>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between text-xs bg-surface-muted px-2 py-1.5 rounded"
                    >
                      <span className="text-text-secondary font-medium">{sub.allocationName}</span>
                      <span className="text-text-muted">
                        Size: {sub.size} / Burst: {sub.burst}
                      </span>
                    </div>
                  ))}
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
                {savingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
