# FTUE funnel telemetry

This document is the review contract for the local FTUE funnel. Events are recorded by `Telemetry`, tagged with the current session number, timestamped in milliseconds, and written to the console and bounded local-storage sink. Collection must never block gameplay.

## Event schema

| Event | Payload | Emission rule |
|---|---|---|
| `app_open` | `first_open`, `session_index` | Once per app session, from boot. |
| `level_start` | `level_id`, `attempt_number`, `mode` | Once when an attempt opens, including restart/retry attempts. |
| `first_tap` | `level_id` | Once after a board render, on the first board interaction. |
| `first_tap_latency` | `level_id`, `ms` | Paired with `first_tap`; ms from board render to that interaction. |
| `move_commit` | `level_id`, `expression`, `correct`, `target_index` | Once per legal binary equation commit, including rejected target values. |
| `equation_commit` | `level_id`, `expression`, `correct`, `target_index` | Compatibility alias of `move_commit` for funnel consumers using the earlier name. |
| `unary_transform` | `level_id`, `from`, `to` | Once per accepted unary transform. |
| `level_clear` | `level_id`, `stars` | Once when a level is cleared and stars are awarded. |
| `level_complete` | `level_id`, `stars`, `attempts`, `duration_ms` | Once alongside `level_clear`, retaining the original GDD completion payload. |
| `level_fail` | `level_id`, `target_index_of_failure`, `attempt_number` | Once when the front target becomes unreachable. |
| `ftue_cue_shown` | `level_id`, `cue` | Once per distinct FTUE cue shown for a level instance. |
| `map_open` | optional `focus_level_id` | Once whenever the map screen opens. |
| `world_complete` | `world` (`1`-`4`) | Once when the world’s `*-10` level clears. |
| `ad_offer_shown` | `placement` | At the start of each rewarded-ad offer. |
| `ad_completed` | `placement` | When the rewarded callback succeeds. |
| `ad_dismissed` | `placement` | When the player closes the ad without a reward. |
| `ad_failed` | `placement` | When no ad is available or the ad provider errors. |

Supporting economy events remain available: `hint_purchased`, `star_bank_update`, `life_depleted`, `clean_retry_started`, and `continue_used`.

## Funnel interpretation

- `app_open` → `level_start` → `first_tap_latency` → `move_commit`/`equation_commit` → `level_clear` is the FTUE path.
- `level_fail` is a terminal attempt outcome, not a second clear.
- `first_tap_latency` is the headline planning metric: compare medians by world from exported raw events.
- Ad events are stubs around the existing rewarded-ad paths; placement values are `ftue_hint`, `clean_retry`, `continue`, and `life_refill`.

## Export

The `?telemetry=1` query path and long-press build label export raw events plus a summary. The summary counts starts, completions, failures, sessions, and median first-tap latency by world.
