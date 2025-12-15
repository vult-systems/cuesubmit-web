/**
 * Centralized mock data for offline mode
 * All mock data should be defined here to ensure consistency across the application
 */

// ============================================================================
// SHOWS - University projects and classes by semester
// ============================================================================
export interface ShowData {
  id: string;
  name: string;
  tag: string;
  description: string;
  active: boolean;
  defaultMinCores: number;
  defaultMaxCores: number;
  bookingEnabled: boolean;
  semester?: string; // e.g., "F25", "S26"
}

export const SHOWS: ShowData[] = [
  // Fall 2025 - Current semester
  {
    id: "show-001",
    name: "Nightlight Guardians",
    tag: "NLG",
    description: "Senior capstone animated short",
    active: true,
    defaultMinCores: 1,
    defaultMaxCores: 16,
    bookingEnabled: true,
    semester: "F25"
  }
];

// ============================================================================
// PROJECT CODES
// ============================================================================
export const PROJECT_CODES = ["DRN", "ECHO", "PRISM", "NEXUS", "VOID", "FLUX", "APEX"];

// ============================================================================
// SCOPES
// ============================================================================
export const SCOPES = ["asset", "shot"] as const;
export type Scope = typeof SCOPES[number];

// ============================================================================
// DEPARTMENTS
// ============================================================================
export const DEPARTMENTS = ["model", "lookdev", "light", "anim", "fx"];

// ============================================================================
// RENDER TYPES / OUTPUTS
// ============================================================================
export const RENDER_TYPES = ["still", "turnaround", "anim", "preview", "lookdev", "playblast"];

// ============================================================================
// USERS
// ============================================================================
export const USERS = ["admin", "jsmith", "mjohnson", "alee", "bwilson", "cgarcia", "dkim", "emartinez"];

// ============================================================================
// ASSETS
// ============================================================================
export const ASSETS = ["hero_char", "villain_char", "env_forest", "env_city", "prop_sword", "prop_vehicle", "creature_dragon"];

// ============================================================================
// SHOTS
// ============================================================================
export const SHOTS = ["sq010_sh010", "sq010_sh020", "sq020_sh010", "sq030_sh010", "sq030_sh020", "sq040_sh010"];

// ============================================================================
// JOB STATES
// ============================================================================
export const JOB_STATES = ["PENDING", "RUNNING", "FINISHED", "DEAD"] as const;
export type JobState = typeof JOB_STATES[number];

// ============================================================================
// FRAME STATES
// ============================================================================
export const FRAME_STATES = ["WAITING", "RUNNING", "SUCCEEDED", "DEAD", "DEPEND", "EATEN", "CHECKPOINT"] as const;
export type FrameState = typeof FRAME_STATES[number];

// ============================================================================
// HOST STATES
// ============================================================================
export const HOST_STATES = ["UP", "DOWN", "REPAIR"] as const;
export type HostState = typeof HOST_STATES[number];

export const LOCK_STATES = ["OPEN", "LOCKED"] as const;
export type LockState = typeof LOCK_STATES[number];

// ============================================================================
// ROOMS / ALLOCATIONS
// ============================================================================
export const ROOMS = ["AD400", "AD404", "AD405", "AD406", "AD407", "AD415"];
export const MACHINES_PER_ROOM = 15;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get a random item from an array */
export function randomItem<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get a random show */
export function randomShow(): ShowData {
  return randomItem(SHOWS);
}

/** Get a random subject based on scope */
export function randomSubject(scope: Scope): string {
  return scope === "asset" ? randomItem(ASSETS) : randomItem(SHOTS);
}

/** Generate a random version string like v01, v02, etc. */
export function randomVersion(): string {
  return `v${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
}

/** Generate a random 8-character system name */
export function randomSystemName(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Generate a random host name using room data (e.g., "AD400-05/1.0") */
export function randomHostName(): string {
  const room = randomItem(ROOMS);
  const machineNum = String(Math.floor(Math.random() * MACHINES_PER_ROOM) + 1).padStart(2, "0");
  return `${room}-${machineNum}/1.0`;
}

/**
 * Generate a job name following the standard format:
 * SHOW_PROJECTCODE_SCOPE_DEPARTMENT_SUBJECT_OUTPUT_USERNAME_VERSION
 */
export function generateJobName(options?: {
  show?: ShowData;
  projectCode?: string;
  scope?: Scope;
  department?: string;
  subject?: string;
  renderType?: string;
  user?: string;
  version?: string;
}): string {
  const show = options?.show ?? randomShow();
  const projectCode = options?.projectCode ?? randomItem(PROJECT_CODES);
  const scope = options?.scope ?? randomItem(SCOPES);
  const department = options?.department ?? randomItem(DEPARTMENTS);
  const subject = options?.subject ?? randomSubject(scope);
  const renderType = options?.renderType ?? randomItem(RENDER_TYPES);
  const user = options?.user ?? randomItem(USERS);
  const version = options?.version ?? randomVersion();
  
  return `${show.tag}_${projectCode}_${scope}_${department}_${subject}_${renderType}_${user}_${version}`;
}

/** Get show by name */
export function getShowByName(name: string): ShowData | undefined {
  return SHOWS.find(s => s.name.toLowerCase() === name.toLowerCase());
}

/** Get show by tag */
export function getShowByTag(tag: string): ShowData | undefined {
  return SHOWS.find(s => s.tag.toLowerCase() === tag.toLowerCase());
}
