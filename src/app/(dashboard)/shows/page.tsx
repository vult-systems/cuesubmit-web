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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Search,
  Plus,
  MoreHorizontal,
  Power,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Show {
  id: string;
  name: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newShowName, setNewShowName] = useState("");
  const [creating, setCreating] = useState(false);

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

  const handleShowAction = async (showId: string, action: string) => {
    try {
      const response = await fetch(`/api/shows/${showId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Show ${action} successful`);
        fetchShows();
      } else {
        toast.error(data.error || `Failed to ${action} show`);
      }
    } catch (error) {
      console.error(`Show ${action} failed:`, error);
      toast.error(`Failed to ${action} show`);
    }
  };

  const columns: ColumnDef<Show>[] = [
    {
      accessorKey: "name",
      header: "Show Name",
      cell: ({ row }) => (
        <div className="font-medium text-text-primary">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => {
        const active = row.getValue<boolean>("active");
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              active
                ? "bg-success-muted text-success border-success/30"
                : "bg-surface-muted text-text-muted border-border"
            )}
          >
            {active ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "defaultMinCores",
      header: "Min Cores",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.getValue("defaultMinCores")}</span>
      ),
    },
    {
      accessorKey: "defaultMaxCores",
      header: "Max Cores",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.getValue("defaultMaxCores")}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const show = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface-raised border-border">
              {show.active ? (
                <DropdownMenuItem
                  onClick={() => handleShowAction(show.id, "deactivate")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <PowerOff className="h-4 w-4" />
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleShowAction(show.id, "activate")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Power className="h-4 w-4" />
                  Activate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: shows,
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

  const activeShows = shows.filter((s) => s.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Shows</h1>
          <p className="text-text-muted text-sm mt-1">
            {activeShows} active show{activeShows !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search shows..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 w-64 bg-surface-muted border-border"
            />
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                New Show
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-surface border-border">
              <DialogHeader>
                <DialogTitle className="text-text-primary">Create New Show</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="showName" className="text-text-secondary">
                    Show Name
                  </Label>
                  <Input
                    id="showName"
                    placeholder="Enter show name..."
                    value={newShowName}
                    onChange={(e) => setNewShowName(e.target.value)}
                    className="bg-surface-muted border-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateShow();
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                    className="border-border"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateShow} disabled={creating}>
                    {creating ? "Creating..." : "Create Show"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchShows();
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
                  Loading shows...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-text-muted">
                  No shows found
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
        {shows.length} show{shows.length !== 1 ? "s" : ""} total
      </div>
    </div>
  );
}
