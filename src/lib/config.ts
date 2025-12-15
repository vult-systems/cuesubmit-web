export type BackendMode = "offline" | "online";

const normalizedMode: BackendMode =
  (process.env.CUEWEB_MODE?.toLowerCase() as BackendMode) === "online"
    ? "online"
    : "offline";

const apiBase = process.env.CUEWEB_API_BASE?.trim() || null;

if (normalizedMode === "online" && !apiBase) {
  throw new Error("CUEWEB_API_BASE is required when CUEWEB_MODE=online");
}

export const config = Object.freeze({
  mode: normalizedMode,
  apiBase,
});

export function requireApiBase(): string {
  if (!config.apiBase) {
    throw new Error("CUEWEB_API_BASE is missing; set it to run in online mode.");
  }
  return config.apiBase;
}
