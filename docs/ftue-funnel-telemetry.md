# FTUE funnel telemetry review note

Telemetry is local-only in the web build: `Telemetry` fans events to zero or more pluggable `TelemetrySink`s. `NoopSink`, `ConsoleSink`, `LocalStorageSink`, and `MemorySink` cover no-op, console, exportable local, and test use. No remote collector or monetization behavior is added.

| Event | Payload | Emission point |
|---|---|---|
| `app_open` | `first_open`, `session_index` | session boot |
| `level_start` | `level_id`, `attempt_number`, `mode` | Director start/retry |
| `first_tap` / `first_tap_latency` | `level_id`; latency `ms` | first board interaction, once per render |
| `equation_commit` / `move_commit` | `level_id`, `expression`, `correct`, `target_index` | accepted arithmetic commit |
| `unary_transform` | `level_id`, `from`, `to` | unary move |
| `ftue_cue_shown` | `level_id`, `cue` | each distinct first-session teaching cue |
| `level_fail` | `level_id`, `target_index_of_failure`, `attempt_number` | stuck board |
| `level_clear` / `level_complete` | `level_id`, `stars` (+ attempts/duration on complete) | clear |
| `star_bank_update` | `total_stars`, `delta`, `reason` | clear changes bank |
| `map_open` | optional `focus_level_id` | map screen open |
| `world_complete` | `world` | first clear of each `-10` level |
| `ad_offer_shown` / `ad_completed` / `ad_dismissed` / `ad_failed` | `placement` | existing rewarded-ad stubs only |

World 1 remains ad-free in behavior: no new ad offer is introduced and the existing unlock gates are unchanged.
