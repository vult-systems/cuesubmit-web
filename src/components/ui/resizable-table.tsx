"use client";

import * as React from "react";
import { useState, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

interface ColumnDef {
  id: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  flex?: number; // Flex grow factor for responsive sizing
}

interface ResizableTableContextType {
  columnWidths: Record<string, number>;
  setColumnWidth: (id: string, width: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
}

const ResizableTableContext = React.createContext<ResizableTableContextType | null>(null);

function useResizableTable() {
  const context = React.useContext(ResizableTableContext);
  if (!context) {
    throw new Error("useResizableTable must be used within a ResizableTable");
  }
  return context;
}

interface ResizableTableProps extends React.ComponentProps<"table"> {
  columns?: ColumnDef[];
  storageKey?: string; // For persisting column widths to localStorage
}

function ResizableTable({ 
  className, 
  columns = [], 
  storageKey,
  children,
  ...props 
}: Readonly<ResizableTableProps>) {
  // Initialize column widths from localStorage or defaults
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (storageKey && globalThis.window !== undefined) {
      const saved = localStorage.getItem(`table-columns-${storageKey}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    // Use default widths
    return columns.reduce((acc, col) => {
      if (col.defaultWidth) {
        acc[col.id] = col.defaultWidth;
      }
      return acc;
    }, {} as Record<string, number>);
  });

  const [isResizing, setIsResizing] = useState(false);

  const setColumnWidth = useCallback((id: string, width: number) => {
    setColumnWidths(prev => {
      const col = columns.find(c => c.id === id);
      let newWidth = width;
      
      // Apply min/max constraints
      if (col?.minWidth) newWidth = Math.max(newWidth, col.minWidth);
      if (col?.maxWidth) newWidth = Math.min(newWidth, col.maxWidth);
      
      const updated = { ...prev, [id]: newWidth };
      
      // Persist to localStorage
      if (storageKey && globalThis.window !== undefined) {
        localStorage.setItem(`table-columns-${storageKey}`, JSON.stringify(updated));
      }
      
      return updated;
    });
  }, [columns, storageKey]);

  const contextValue = useMemo(() => ({
    columnWidths,
    setColumnWidth,
    isResizing,
    setIsResizing,
  }), [columnWidths, setColumnWidth, isResizing]);

  return (
    <ResizableTableContext.Provider value={contextValue}>
      <div
        data-slot="resizable-table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          data-slot="resizable-table"
          className={cn(
            "w-full caption-bottom text-sm table-fixed",
            isResizing && "select-none",
            className
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    </ResizableTableContext.Provider>
  );
}

function ResizableTableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="resizable-table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-neutral-200 dark:[&_tr]:border-white/6", className)}
      {...props}
    />
  );
}

function ResizableTableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="resizable-table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function ResizableTableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="resizable-table-row"
      className={cn(
        "hover:bg-black/3 dark:hover:bg-white/2 data-[state=selected]:bg-black/5 dark:data-[state=selected]:bg-white/4 border-b border-neutral-100 dark:border-white/4 transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}

interface ResizableTableHeadProps extends React.ComponentProps<"th"> {
  columnId?: string;
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

function ResizableTableHead({ 
  className, 
  columnId,
  resizable = true,
  minWidth = 60,
  maxWidth = 400,
  style,
  children,
  ...props 
}: Readonly<ResizableTableHeadProps>) {
  const context = React.useContext(ResizableTableContext);
  const headerRef = useRef<HTMLTableCellElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  const width = columnId && context?.columnWidths[columnId];
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!columnId || !context || !resizable) return;
    
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = headerRef.current?.offsetWidth || 0;
    context.setIsResizing(true);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
      context.setColumnWidth(columnId, newWidth);
    };
    
    const handleMouseUp = () => {
      context.setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnId, context, resizable, minWidth, maxWidth]);

  return (
    <th
      ref={headerRef}
      data-slot="resizable-table-head"
      className={cn(
        "text-text-muted h-8 px-3 text-left align-middle font-medium text-[10px] uppercase tracking-wider whitespace-nowrap relative group",
        "[&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        className
      )}
      style={{
        ...style,
        width: width ? `${width}px` : style?.width,
        minWidth: minWidth,
        maxWidth: maxWidth,
      }}
      {...props}
    >
      {children}
      {resizable && columnId && (
        <button
          type="button"
          aria-label={`Resize column ${columnId}`}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-neutral-400 dark:hover:bg-white/30 focus:opacity-100 focus:bg-neutral-400 dark:focus:bg-white/30 transition-opacity outline-none border-0 bg-transparent p-0"
          onMouseDown={handleMouseDown}
          onKeyDown={(e) => {
            if (!columnId || !context) return;
            const step = e.shiftKey ? 20 : 5;
            const currentWidth = headerRef.current?.offsetWidth || minWidth;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const newWidth = Math.max(minWidth, currentWidth - step);
              context.setColumnWidth(columnId, newWidth);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const newWidth = Math.min(maxWidth, currentWidth + step);
              context.setColumnWidth(columnId, newWidth);
            }
          }}
        />
      )}
    </th>
  );
}

interface ResizableTableCellProps extends React.ComponentProps<"td"> {
  columnId?: string;
}

function ResizableTableCell({ className, columnId, style, ...props }: Readonly<ResizableTableCellProps>) {
  const context = React.useContext(ResizableTableContext);
  const width = columnId && context?.columnWidths[columnId];
  
  return (
    <td
      data-slot="resizable-table-cell"
      className={cn(
        "px-3 py-2 align-middle text-xs overflow-hidden text-ellipsis",
        "[&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        className
      )}
      style={{
        ...style,
        width: width ? `${width}px` : style?.width,
      }}
      {...props}
    />
  );
}

export {
  ResizableTable,
  ResizableTableHeader,
  ResizableTableBody,
  ResizableTableRow,
  ResizableTableHead,
  ResizableTableCell,
  useResizableTable,
  type ColumnDef,
};
