Draft-only review evidence for the 1-04 planning trap (PR #13; do not merge).

Evidence files:
- 01-ftue-104-before.png — clean 1-04 board before the tempting 1 + 3 = 4 commit.
- 02-ftue-104-mid-commit.png — filled 1 + 3 equation held mid-commit, “Wait — what makes the 9?” caption, later-target ring, and scarce 3/6 tile rings.
- 03-ftue-104-after-rewind.png — settled scripted warning with “rewound free — no star, no life, no failure” and a visible Go Back CTA.

MD5:
- 01: bcf86911a0d5c563abde7413fe517b6b
- 02: 328ed6ff4e525117f729a2414eb61b57
- 03: 1738d52f01df445b2d961d7ce0ab3a32

The three frames are byte-distinct; mid differs by the filled equation/focus veil/path/caption plus honest consumed 1/3 pool holes and a spent + dial, and after differs by the settled warning panel and free Go Back action. Captured through /workspace/run-shot.sh with ?sprites=1.

Typecheck: green.
Build: green.
Full Vitest: green, 446 tests across 49 files.
PE-03b and locked-plate meter hide nit intentionally excluded.

## Scout REJECT fix — mid-frame honesty

- The scripted trap hold keeps the filled 1 + 3 equation for teaching, while the renderer masks those source pool seats with consumed holes and redraws the staged `+` as spent/unavailable.
- Recaptured `02-ftue-104-mid-commit.png`; no duplicate `1` or staged `3` remains on the pool grid, and the pool `+` dial is visibly spent.
- Typecheck, build, and full Vitest pass on the fix.
