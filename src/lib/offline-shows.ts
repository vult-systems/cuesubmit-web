import { type Show } from "@/lib/opencue/gateway-client";
import { SHOWS } from "@/lib/mock-data";

// In-memory store for offline mode shows - initialized from centralized mock data
let offlineShows: Show[] = SHOWS.map(s => ({
  id: s.id,
  name: s.name,
  tag: s.tag,
  description: s.description,
  active: s.active,
  defaultMinCores: s.defaultMinCores,
  defaultMaxCores: s.defaultMaxCores,
  bookingEnabled: s.bookingEnabled,
  semester: s.semester
}));

export function getOfflineShows(): Show[] {
  return offlineShows;
}

export function setOfflineShows(shows: Show[]): void {
  offlineShows = shows;
}
