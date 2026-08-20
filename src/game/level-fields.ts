/**
 * The fields the RUNTIME reads from a level (GDD §10: metrics do not ship).
 *
 * One list, used three ways: the build tool strips to it, the shipped file is
 * asserted against it, and `LadderLevel` is checked against it at compile time.
 * That is the point — a field added to the loader without being added here is a
 * type error, and a field here that the build does not emit is a test failure,
 * so the shipped payload cannot silently drift from what the game needs.
 *
 * The failure this prevents is specific and quiet: the game asking for
 * something the build stripped, on a device, at runtime, in a level nobody
 * tested — which is exactly how a size optimisation turns into a crash.
 */
export const RUNTIME_LEVEL_FIELDS = [
  "id",
  "world",
  "pool",
  "targets",
  "rules",
  "modes",
  "surplus",
] as const;

/** Per-mode fields. `metrics` is deliberately absent — it is curation output. */
export const RUNTIME_MODE_FIELDS = ["budget", "tier"] as const;

export type RuntimeLevelField = (typeof RUNTIME_LEVEL_FIELDS)[number];
export type RuntimeModeField = (typeof RUNTIME_MODE_FIELDS)[number];
