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

  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedItem(null);

    try {
      const response = await fetch(`/api/files/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load directory");
      }

      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);

      // Filter items based on mode and extensions
      let filteredItems = data.items;
      if (mode === "file" && fileExtensions?.length) {
        filteredItems = data.items.filter(
          (item: FileItem) =>
            item.isDirectory || fileExtensions.includes(item.extension || "")
        );
      }
      setItems(filteredItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [mode, fileExtensions]);

  useEffect(() => {
    if (open) {
      fetchDirectory(currentPath);
    }
  }, [open, fetchDirectory, currentPath]);

  const handleItemClick = (item: FileItem) => {
    if (item.isDirectory) {
      // Double-click to enter directory
      setSelectedItem(item);
    } else if (mode === "file") {
      setSelectedItem(item);
    }
  };

  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDirectory) {
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
      fetchDirectory(parentPath);
    }
  };

  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return selectedItem?.path === item.path ? FolderOpen : Folder;
    }
    return fileIcons[item.extension || ""] || File;
  };

  const canSelect = mode === "directory" || (selectedItem && !selectedItem.isDirectory);

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
              <div className="p-1">
                {items.map((item) => {
                  const Icon = getFileIcon(item);
                  const isSelected = selectedItem?.path === item.path;

                  return (
                    <div
                      key={item.path}
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
                        isSelected
                          ? "bg-blue-500/20 text-blue-400"
                          : "hover:bg-neutral-100 dark:hover:bg-white/5"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          item.isDirectory
                            ? "text-amber-500"
                            : "text-text-muted"
                        )}
                      />
                      <span className="text-sm truncate">{item.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              {mode === "directory"
                ? "Select a folder or use current directory"
                : "Double-click to select a file"}
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
