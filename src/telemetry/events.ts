/**
 * GDD §7.8 event funnel.
 *
 * Read as a step-by-step funnel, not an average — "a single averaged retention
 * number hides exactly where players leave."
 */
export type TelemetryEvent =
  | { readonly name: "app_open"; readonly first_open: boolean; readonly session_index: number }
  | {
      readonly name: "level_start";
      readonly level_id: string;
      readonly attempt_number: number;
      readonly mode: string;
    }
  /**
   * THE metric for this game (§7.8), and one that appears on no standard list:
   * ms from board render to first tap. A direct proxy for whether the player is
   * planning or guessing.
   *
   * Expected shape: ~1s in World 1, rising to 10–30s by World 3 as levels
   * demand real lookahead. **If it stays near 1s into World 2, players are
   * guessing and the core design is not landing** — a design failure visible in
   * telemetry long before it reaches reviews or churn.
   */
  | { readonly name: "first_tap_latency"; readonly level_id: string; readonly ms: number }
  | {
      readonly name: "move_commit";
      readonly level_id: string;
      readonly expression: string;
      readonly correct: boolean;
      readonly target_index: number;
    }
  | {
      readonly name: "unary_transform";
      readonly level_id: string;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly name: "level_fail";
      readonly level_id: string;
      readonly target_index_of_failure: number;
      readonly attempt_number: number;
    }
  | {
      readonly name: "level_complete";
      readonly level_id: string;
      readonly stars: number;
      readonly attempts: number;
      readonly duration_ms: number;
    }
  | {
      readonly name: "hint_purchased";
      readonly level_id: string;
      readonly hint_type: string;
      readonly stars_spent: number;
    }
  | { readonly name: "life_depleted"; readonly level_id: string }
  | { readonly name: "clean_retry_started"; readonly level_id: string; readonly attempt_number: number }
  /**
   * GDD §9.4: a rewarded continue was taken, and where it rewound to.
   *
   * Worth its own event rather than folding into level_fail: a continue is a
   * paid decision, and how often players buy their way past a given target is
   * the signal that says whether that target is hard or unfair.
   */
  | {
      readonly name: "continue_used";
      readonly level_id: string;
      readonly target_index: number;
      readonly attempt_number: number;
    };

export type TelemetryEventName = TelemetryEvent["name"];

export interface RecordedEvent {
  readonly at: number;
  readonly session: number;
  readonly event: TelemetryEvent;
}
