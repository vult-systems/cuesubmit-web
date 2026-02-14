"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Loader2,
  FolderOpen,
  FileImage,
  FileVideo,
  FileCode,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FILE_SERVER = process.env.NEXT_PUBLIC_FILE_SERVER_IP || "localhost";

export const ROOT_PATHS = [
  { label: "RenderOutputRepo", path: `\\\\${FILE_SERVER}\\RenderOutputRepo` },
  { label: "RenderSourceRepository", path: `\\\\${FILE_SERVER}\\RenderSourceRepository` },
];

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  extension: string | null;
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

// ─── Project Folder Picker ──────────────────────────────────────────
// Shows the configured paths themselves as clickable buttons.
// Their contents (subfolders like MagnumOpus, Cut, etc.) appear in the inline file tree.

const PROJECT_SOURCES = [
  { label: "NLG Source", path: `\\\\${FILE_SERVER}\\RenderSourceRepository\\25_26\\NLG` },
  { label: "Projects", path: `\\\\${FILE_SERVER}\\RenderOutputRepo\\Projects` },
  { label: "Thesis NLG", path: `\\\\${FILE_SERVER}\\RenderOutputRepo\\Thesis_25-26\\NLG` },
];

interface ProjectFolderPickerProps {
  value: string;
  onSelect: (path: string) => void;
}

export function ProjectFolderPicker({ value, onSelect }: Readonly<ProjectFolderPickerProps>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROJECT_SOURCES.map((source) => {
        const isActive = value === source.path;
        return (
          <Button
            key={source.path}
            type="button"
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={cn(
              "text-xs h-7 px-2.5 gap-1.5",
              isActive && "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"
            )}
            onClick={() => onSelect(isActive ? "" : source.path)}
          >
            <Folder className="h-3 w-3" />
            {source.label}
            {isActive && <Check className="h-3 w-3" />}
          </Button>
        );
      })}
    </div>
  );
}

// ─── Inline File Tree ───────────────────────────────────────────────
// A collapsible tree browser that appears inline below the input

interface InlineFileBrowserProps {
  /** Whether the tree panel is open */
  open: boolean;
  /** Called when a file/folder is selected */
  onSelect: (path: string) => void;
  /** "file" = pick a file, "directory" = pick a folder */
  mode: "file" | "directory";
  /** Starting path — overridden by projectFolder if set */
  rootPath?: string;
  /** If set, start browsing inside this project folder path */
  projectFolder?: string;
  /** Filter visible files by extension */
  fileExtensions?: string[];
  /** Currently selected value (to show a check mark) */
  currentValue?: string;
}

export function InlineFileBrowser({
  open,
  onSelect,
  mode,
  rootPath,
  projectFolder,
  fileExtensions,
  currentValue,
}: Readonly<InlineFileBrowserProps>) {
  // Determine starting path: project folder > custom rootPath > first root
  const startPath = projectFolder || rootPath || ROOT_PATHS[0].path;

  const [currentDir, setCurrentDir] = useState(startPath);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, FileItem[]>>({});

  const fetchDir = useCallback(
    async (path: string, forExpand = false) => {
      if (!forExpand) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/files/browse?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");

        let filtered: FileItem[] = data.items;
        if (mode === "file" && fileExtensions?.length) {
          filtered = data.items.filter(
            (item: FileItem) => item.isDirectory || fileExtensions.includes(item.extension || "")
          );
        }
        if (forExpand) return filtered;

        setCurrentDir(data.currentPath);
        setItems(filtered);
      } catch (err) {
        if (!forExpand) setError(err instanceof Error ? err.message : "Failed to load");
        return [];
      } finally {
        if (!forExpand) setLoading(false);
      }
    },
    [mode, fileExtensions]
  );

  // Re-fetch when panel opens or startPath changes
  useEffect(() => {
    if (open) {
      setExpandedPaths(new Set());
      setChildrenCache({});
      setCurrentDir(startPath);
      fetchDir(startPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startPath]);

  const toggleExpand = async (item: FileItem) => {
    if (!item.isDirectory) return;
    const newExp = new Set(expandedPaths);
    if (expandedPaths.has(item.path)) {
      newExp.delete(item.path);
      setExpandedPaths(newExp);
    } else if (childrenCache[item.path]) {
      newExp.add(item.path);
      setExpandedPaths(newExp);
    } else {
      newExp.add(item.path);
      setExpandedPaths(newExp);
      const children = await fetchDir(item.path, true);
      setChildrenCache((prev) => ({ ...prev, [item.path]: children || [] }));
    }
  };

  const handleClick = (item: FileItem) => {
    if (item.isDirectory) {
      if (mode === "directory") {
        onSelect(item.path);
      }
      toggleExpand(item);
    } else if (mode === "file") {
      onSelect(item.path);
    }
  };

  const getIcon = (item: FileItem, expanded: boolean) => {
    if (item.isDirectory) return expanded ? FolderOpen : Folder;
    return fileIcons[item.extension || ""] || File;
  };

  const renderItem = (item: FileItem, depth: number = 0) => {
    const expanded = expandedPaths.has(item.path);
    const children = childrenCache[item.path] || [];
    const isLoadingChildren = expanded && !childrenCache[item.path];
    const Icon = getIcon(item, expanded);
    const isSelected = currentValue === item.path;

    return (
      <div key={item.path}>
        <button
          type="button"
          onClick={() => handleClick(item)}
          className={cn(
            "flex items-center gap-1 py-1 rounded-md cursor-pointer transition-colors w-full text-left group",
            isSelected
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "hover:bg-neutral-100 dark:hover:bg-white/5"
          )}
          style={{ paddingLeft: `${depth * 14 + 6}px`, paddingRight: "8px" }}
        >
          {item.isDirectory ? (
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {isLoadingChildren ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin text-text-muted" />
              ) : expanded ? (
                <ChevronDown className="h-2.5 w-2.5 text-text-muted" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5 text-text-muted" />
              )}
            </span>
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              item.isDirectory ? "text-amber-500" : "text-text-muted"
            )}
          />
          <span className="text-xs truncate flex-1">{item.name}</span>
          {isSelected && <Check className="h-3 w-3 text-amber-500 shrink-0" />}
        </button>
        {expanded && children.length > 0 && (
          <div>{children.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (!open) return null;

  // Build breadcrumb segments from currentDir
  const breadcrumbs = buildBreadcrumbs(currentDir);

  return (
    <div className="mt-1.5 rounded-lg border border-neutral-200 dark:border-white/8 bg-neutral-50 dark:bg-neutral-950/40 overflow-hidden">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-neutral-200 dark:border-white/6 bg-neutral-100/50 dark:bg-neutral-900/50 overflow-x-auto">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <ChevronRight className="h-2.5 w-2.5 text-text-muted" />}
            <button
              type="button"
              onClick={() => {
                setCurrentDir(crumb.path);
                setExpandedPaths(new Set());
                setChildrenCache({});
                fetchDir(crumb.path);
              }}
              className={cn(
                "text-[10px] px-1 py-0.5 rounded hover:bg-neutral-200 dark:hover:bg-white/8 transition-colors",
                i === breadcrumbs.length - 1
                  ? "text-text-primary font-medium"
                  : "text-text-muted"
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Tree content */}
      <ScrollArea className="h-48">
        {loading && (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          </div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-center h-full py-8 text-red-500 text-xs">
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="flex items-center justify-center h-full py-8 text-text-muted text-xs">
            Empty directory
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="py-0.5">{items.map((item) => renderItem(item, 0))}</div>
        )}
      </ScrollArea>
    </div>
  );
}

// Build breadcrumb segments between startPath and currentDir
function buildBreadcrumbs(currentDir: string) {
  // Normalize to forward slashes for comparison
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const normCurrent = norm(currentDir);

  // Find the root label
  const matchedRoot = ROOT_PATHS.find((r) => normCurrent.startsWith(norm(r.path)));

  const crumbs: { label: string; path: string }[] = [];

  if (matchedRoot) {
    const rootNorm = norm(matchedRoot.path);
    crumbs.push({ label: matchedRoot.label, path: matchedRoot.path });

    // Add segments between root and current
    const remainder = normCurrent.slice(rootNorm.length).replace(/^\//, "");
    if (remainder) {
      const parts = remainder.split("/");
      let built = rootNorm;
      for (const part of parts) {
        built += "/" + part;
        // Convert back to UNC for the path
        const uncPath = built.replace(/\//g, "\\");
        crumbs.push({ label: part, path: uncPath });
      }
    }
  } else {
    crumbs.push({ label: currentDir, path: currentDir });
  }

  return crumbs;
}
