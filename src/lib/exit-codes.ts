// OpenCue Exit Code Definitions
// These are standard exit codes used by RQD and render processes

export interface ExitCodeInfo {
  code: number;
  label: string;
  description: string;
  color: "muted" | "running" | "success" | "error" | "warning";
}

// Well-known exit codes
const exitCodeDefinitions: Record<number, Omit<ExitCodeInfo, "code">> = {
  [-1]: {
    label: "Pending",
    description: "Frame has not run yet",
    color: "muted",
  },
  [0]: {
    label: "Success",
    description: "Frame completed successfully",
    color: "success",
  },
  [1]: {
    label: "Error",
    description: "General error",
    color: "error",
  },
  [256]: {
    label: "Killed",
    description: "Frame was killed by user or system",
    color: "warning",
  },
  [299]: {
    label: "Running",
    description: "Frame is currently rendering",
    color: "running",
  },
  [9]: {
    label: "Killed (SIGKILL)",
    description: "Process was forcefully terminated",
    color: "error",
  },
  [137]: {
    label: "OOM Killed",
    description: "Out of memory - process was killed by system",
    color: "error",
  },
  [139]: {
    label: "Segfault",
    description: "Segmentation fault - process crashed",
    color: "error",
  },
  [143]: {
    label: "Terminated",
    description: "Process was terminated (SIGTERM)",
    color: "warning",
  },
};

/**
 * Get human-readable information about an exit code
 */
export function getExitCodeInfo(exitCode: number): ExitCodeInfo {
  const info = exitCodeDefinitions[exitCode];
  
  if (info) {
    return { code: exitCode, ...info };
  }
  
  // Unknown exit codes
  if (exitCode > 0 && exitCode < 128) {
    return {
      code: exitCode,
      label: `Error ${exitCode}`,
      description: `Application exited with error code ${exitCode}`,
      color: "error",
    };
  }
  
  if (exitCode >= 128) {
    const signal = exitCode - 128;
    return {
      code: exitCode,
      label: `Signal ${signal}`,
      description: `Process terminated by signal ${signal}`,
      color: "error",
    };
  }
  
  return {
    code: exitCode,
    label: `${exitCode}`,
    description: `Unknown exit code`,
    color: "muted",
  };
}

/**
 * Get a short display label for an exit code
 */
export function getExitCodeLabel(exitCode: number): string {
  return getExitCodeInfo(exitCode).label;
}

/**
 * Get the color class for an exit code
 */
export function getExitCodeColorClass(exitCode: number): string {
  const info = getExitCodeInfo(exitCode);
  
  switch (info.color) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "running":
      return "text-blue-600 dark:text-blue-400";
    case "muted":
    default:
      return "text-text-muted";
  }
}
