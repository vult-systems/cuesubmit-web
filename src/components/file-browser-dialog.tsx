"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  File,
  ChevronUp,
  ChevronRight,
  ChevronDown,
  Loader2,
  FolderOpen,
  FileImage,
  FileVideo,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  extension: string | null;
  children?: FileItem[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

interface FileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  mode: "file" | "directory";
  title?: string;
  fileExtensions?: string[]; // Filter by extensions, e.g., [".ma", ".mb", ".hip"]
}

const fileIcons: Record<string, typeof File> = {
  ".ma": FileCode,
  ".mb": FileCode,
  ".hip": FileCode,
  ".hipnc": FileCode,
  ".exr": FileImage,
  ".png": FileImage,
  ".jpg": FileImage,
  ".jpeg": FileImage,
  ".tif": FileImage,
  ".tiff": FileImage,
  ".mov": FileVideo,
  ".mp4": FileVideo,
};

export function FileBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  mode,
  title,
  fileExtensions,
}: FileBrowserDialogProps) {
  const [currentPath, setCurrentPath] = useState("\\\\REDACTED_IP\\RenderOutputRepo");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, FileItem[]>>({});

  const fetchDirectory = useCallback(async (path: string, forExpand = false) => {
    if (!forExpand) {
      setLoading(true);
      setError(null);
      setSelectedItem(null);
      setExpandedPaths(new Set());
      setChildrenCache({});
    }

    try {
      const response = await fetch(`/api/files/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load directory");
      }

      // Filter items based on mode and extensions
      let filteredItems = data.items;
      if (mode === "file" && fileExtensions?.length) {
        filteredItems = data.items.filter(
          (item: FileItem) =>
            item.isDirectory || fileExtensions.includes(item.extension || "")
        );
      }

      if (forExpand) {
        return filteredItems;
      }

      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setItems(filteredItems);
    } catch (err) {
      if (!forExpand) {
        setError(err instanceof Error ? err.message : "Failed to load directory");
      }
      return [];
    } finally {
      if (!forExpand) {
        setLoading(false);
      }
    }
  }, [mode, fileExtensions]);

  useEffect(() => {
    if (open) {
      fetchDirectory(currentPath);
    }
  }, [open, fetchDirectory, currentPath]);

  const toggleExpand = async (item: FileItem) => {
    if (!item.isDirectory) return;

    const newExpanded = new Set(expandedPaths);
    
    if (expandedPaths.has(item.path)) {
      // Collapse
      newExpanded.delete(item.path);
      setExpandedPaths(newExpanded);
    } else {
      // Expand - fetch children if not cached
      if (!childrenCache[item.path]) {
        // Mark as loading
        setExpandedPaths(new Set([...newExpanded, item.path]));
        const children = await fetchDirectory(item.path, true);
        setChildrenCache(prev => ({ ...prev, [item.path]: children || [] }));
      } else {
        newExpanded.add(item.path);
        setExpandedPaths(newExpanded);
      }
    }
  };

  const handleItemClick = (item: FileItem) => {
    setSelectedItem(item);
    if (item.isDirectory) {
      toggleExpand(item);
    }
  };

  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDirectory) {
      // Navigate into folder
      setCurrentPath(item.path);
      fetchDirectory(item.path);
    } else if (mode === "file") {
      onSelect(item.path);
      onOpenChange(false);
    }
  };

  const handleSelect = () => {
    if (mode === "directory") {
      onSelect(selectedItem?.isDirectory ? selectedItem.path : currentPath);
    } else if (selectedItem && !selectedItem.isDirectory) {
      onSelect(selectedItem.path);
    }
    onOpenChange(false);
  };

  const handleNavigateUp = () => {
    if (parentPath) {
      setCurrentPath(parentPath);
      fetchDirectory(parentPath);
    }
  };

  const getFileIcon = (item: FileItem, isExpanded: boolean) => {
    if (item.isDirectory) {
      return isExpanded ? FolderOpen : Folder;
    }
    return fileIcons[item.extension || ""] || File;
  };

  const canSelect = mode === "directory" || (selectedItem && !selectedItem.isDirectory);

  // Recursive render function for tree items
  const renderItem = (item: FileItem, depth: number = 0) => {
    const isExpanded = expandedPaths.has(item.path);
    const isSelected = selectedItem?.path === item.path;
    const Icon = getFileIcon(item, isExpanded);
    const children = childrenCache[item.path] || [];
    const isLoadingChildren = isExpanded && !childrenCache[item.path];

    return (
      <div key={item.path}>
        <div
          onClick={() => handleItemClick(item)}
          onDoubleClick={() => handleItemDoubleClick(item)}
          className={cn(
            "flex items-center gap-1 py-1.5 rounded-md cursor-pointer transition-colors",
            isSelected
              ? "bg-blue-500/20 text-blue-400"
              : "hover:bg-neutral-100 dark:hover:bg-white/5"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: '12px' }}
        >
          {/* Expand/collapse chevron for directories */}
          {item.isDirectory ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {isLoadingChildren ? (
                <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
              ) : isExpanded ? (
                <ChevronDown className="h-3 w-3 text-text-muted" />
              ) : (
                <ChevronRight className="h-3 w-3 text-text-muted" />
              )}
            </span>
          ) : (
            <span className="w-4 h-4 shrink-0" />
          )}
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              item.isDirectory ? "text-amber-500" : "text-text-muted"
            )}
          />
          <span className="text-sm truncate">{item.name}</span>
        </div>
        
        {/* Render children if expanded */}
        {isExpanded && children.length > 0 && (
          <div>
            {children.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {title || (mode === "file" ? "Select File" : "Select Directory")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current Path */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNavigateUp}
              disabled={!parentPath || loading}
              className="h-8 w-8 shrink-0"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Input
              value={currentPath}
              readOnly
              className="font-mono text-xs bg-neutral-100 dark:bg-neutral-900"
            />
          </div>

          {/* File List */}
          <ScrollArea className="h-[400px] border rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-500 text-sm">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Empty directory
              </div>
            ) : (
              <div className="py-1">
                {items.map(item => renderItem(item, 0))}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              {mode === "directory"
                ? "Click to expand, double-click to navigate"
                : "Click to expand folders, double-click to select"}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSelect} disabled={!canSelect}>
                Select
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
