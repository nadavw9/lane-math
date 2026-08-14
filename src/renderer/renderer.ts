import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

import type { BinaryOp, Mode, UnaryOp } from "../solver/index.js";
import type { Command, InputEvent, ViewState } from "../game/types.js";
import {
  DESIGN,
  EQUATION,
  LANE,
  PALETTE,
  POOL,
  STATUS,
  equationSlot,
  operatorSlot,
  poolSlot,
  targetSlot,
} from "./layout.js";

const BINARY: readonly BinaryOp[] = ["+", "-", "*", "/"];
const UNARY: readonly UnaryOp[] = ["sqrt", "sq"];
const LABEL: Record<string, string> = { sqrt: "√", sq: "x²", "*": "×", "/": "÷", "-": "−" };

/**
 * The Renderer draws commands and emits input. It holds a view model built from
 * commands and never reads Director state directly, and it decides no rules —
 * every legality question was already answered by the Director via the solver.
 */
export class Renderer {
  private readonly app = new Application();
  private readonly root = new Container();
  private state: ViewState | null = null;
  private rejection: string | null = null;
  private emit: (input: InputEvent) => void = () => {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: DESIGN.width,
      height: DESIGN.height,
      background: PALETTE.background,
      antialias: false,
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);

    // Scale to fit the viewport. The design surface is a fixed 420x900; without
    // this the status band at the bottom — which is where FAILED and CLEARED
    // are reported — falls off the bottom of a short window and the player
    // cannot see why the level stopped.
    const fit = (): void => {
      // Fit the phone frame this canvas sits in, not the browser window.
      const box = host.getBoundingClientRect();
      const scale = Math.min(box.height / DESIGN.height, box.width / DESIGN.width);
      this.app.canvas.style.width = `${Math.round(DESIGN.width * scale)}px`;
      this.app.canvas.style.height = `${Math.round(DESIGN.height * scale)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
  }

  onInput(handler: (input: InputEvent) => void): void {
    this.emit = handler;
  }

  apply(commands: readonly Command[]): void {
    for (const command of commands) {
      if (command.type === "reject") this.rejection = command.reason;
      if (command.type === "render") {
        this.state = command.state;
        if (commands.some((c) => c.type === "reject") === false) this.rejection = null;
      }
    }
    this.draw();
  }

  private text(value: string, size: number, colour: number): Text {
    return new Text({
      text: value,
      style: new TextStyle({
        fontFamily: "system-ui, sans-serif",
        fontSize: size,
        fontWeight: "bold",
        fill: colour,
      }),
    });
  }

  private box(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    label: string,
    labelColour: number,
    onTap?: () => void,
    outline?: number,
  ): Container {
    const container = new Container();
    const g = new Graphics().roundRect(0, 0, w, h, 6).fill(fill);
    if (outline !== undefined) g.roundRect(0, 0, w, h, 6).stroke({ width: 3, color: outline });
    container.addChild(g);

    const t = this.text(label, Math.min(22, h * 0.5), labelColour);
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    container.addChild(t);

    container.position.set(x, y);
    if (onTap) {
      container.eventMode = "static";
      container.cursor = "pointer";
      container.on("pointertap", onTap);
    }
    return container;
  }

  private draw(): void {
    this.root.removeChildren();
    const s = this.state;
    if (!s) return;

    // --- lane: the FULL target queue, visible from level open (GDD §4.2) ---
    this.root.addChild(
      new Graphics().roundRect(LANE.x, LANE.y, LANE.width, LANE.height, 8).fill(PALETTE.lane),
    );
    for (let i = s.targets.length - 1; i >= 0; i--) {
      const slot = targetSlot(i, s.targets.length);
      const cleared = i < s.targetIndex;
      const front = i === s.targetIndex;
      this.root.addChild(
        this.box(
          slot.x,
          slot.y,
          slot.w,
          slot.h,
          cleared ? PALETTE.targetCleared : front ? PALETTE.targetFront : PALETTE.targetPlate,
          String(s.targets[i]),
          cleared ? PALETTE.textDim : PALETTE.text,
          undefined,
          front ? PALETTE.highlight : undefined,
        ),
      );
    }

    // --- equation row: three slots + commit ---
    const tileOf = (id: number | null) =>
      id === null ? null : (s.tiles.find((t) => t.id === id) ?? null);
    const left = tileOf(s.slots.leftTileId);
    const right = tileOf(s.slots.rightTileId);

    const slotSpecs: [string, boolean, 0 | 1 | 2][] = [
      [left ? String(left.value) : "_", left !== null, 0],
      [s.slots.op ? (LABEL[s.slots.op] ?? s.slots.op) : "_", s.slots.op !== null, 1],
      [right ? String(right.value) : "_", right !== null, 2],
    ];
    slotSpecs.forEach(([label, filled, index]) => {
      const r = equationSlot(index);
      this.root.addChild(
        this.box(
          r.x,
          r.y,
          r.w,
          r.h,
          filled ? PALETTE.slotFilled : PALETTE.slot,
          label,
          filled ? PALETTE.text : PALETTE.textDim,
          () => this.emit({ type: "tapSlot", index }),
        ),
      );
    });

    const canCommit = s.affordance === "commit";
    const commitRect = equationSlot(3);
    this.root.addChild(
      this.box(
        commitRect.x,
        commitRect.y,
        commitRect.w,
        commitRect.h,
        canCommit ? PALETTE.commit : PALETTE.commitDim,
        "=",
        canCommit ? PALETTE.text : PALETTE.textDim,
        canCommit ? () => this.emit({ type: "tapCommit" }) : undefined,
        canCommit ? PALETTE.highlight : undefined,
      ),
    );

    // --- operators. Affordance rule (§3.5): bold-active paired with dim-inactive.
    const available = [
      ...BINARY.filter((op) => s.budget[op] !== undefined),
      ...UNARY.filter((op) => s.budget[op] !== undefined),
    ];
    available.forEach((op, i) => {
      const r = operatorSlot(i, available.length);
      const remaining = s.budget[op];
      const isUnary = (UNARY as readonly string[]).includes(op);
      const spent = remaining === 0;
      const active = isUnary
        ? s.affordance !== "transform" || s.transformOp === op
        : s.affordance === "operators";
      const enabled = !spent && (isUnary ? true : s.affordance === "operators");

      this.root.addChild(
        this.box(
          r.x,
          r.y,
          r.w,
          r.h,
          enabled && active ? PALETTE.operator : PALETTE.operatorDim,
          `${LABEL[op] ?? op}`,
          enabled && active ? PALETTE.text : PALETTE.textDim,
          spent
            ? undefined
            : isUnary
              ? () => this.emit({ type: "tapUnary", op: op as UnaryOp })
              : () => this.emit({ type: "tapOperator", op: op as BinaryOp }),
          s.transformOp === op ? PALETTE.highlight : undefined,
        ),
      );
    });

    // --- number pool ---
    const inSlot = new Set([s.slots.leftTileId, s.slots.rightTileId].filter((v) => v !== null));
    // Branch elimination strikes out the tiles of the fatal option; the
    // keystone warning pulses the tiles that make the starved target.
    const hinted = new Set(s.hints.flatMap((h) => h.tileIds));
    const pulsed = new Set(s.warning?.keystoneTileIds ?? []);
    let drawn = 0;
    for (const tile of s.tiles) {
      if (tile.consumed) continue;
      const r = poolSlot(drawn++);
      const transformable = s.transformableTileIds.includes(tile.id);
      const dimmed =
        s.affordance === "transform"
          ? !transformable
          : s.affordance === "operators" || inSlot.has(tile.id);

      this.root.addChild(
        this.box(
          r.x,
          r.y,
          r.w,
          r.h,
          dimmed
            ? PALETTE.tileDim
            : tile.transformed
              ? PALETTE.tileTransformed
              : PALETTE.tile,
          String(tile.value),
          dimmed ? PALETTE.textDim : PALETTE.text,
          () => this.emit({ type: "tapTile", id: tile.id }),
          transformable || pulsed.has(tile.id) || hinted.has(tile.id)
            ? PALETTE.highlight
            : undefined,
        ),
      );
    }

    // --- economy HUD. GDD §7.6: gated systems are ABSENT before their
    // unlock, never greyed out — a greyed shop still teaches "not for me".
    const eco = s.economy;
    const u = s.unlocks;
    if (eco) {
      // Lives: absent entirely until 2-8 (§7.6), and off in World 1 (§7.2).
      if (u.lives && eco.livesActive) {
        const hud = this.text(
          `${"♥".repeat(eco.lives)}${"·".repeat(Math.max(0, eco.maxLives - eco.lives))}  ${eco.lives}/${eco.maxLives}`,
          14,
          eco.lives === 0 ? PALETTE.failed : PALETTE.text,
        );
        hud.position.set(LANE.x + 8, LANE.y + 6);
        this.root.addChild(hud);
      }

      // Star counter: a prize for clearing 1-1, not pre-existing chrome.
      if (u.starCounter) {
        const stars = this.text(
          `${"★".repeat(eco.bestStars)}${"☆".repeat(3 - eco.bestStars)}  ${eco.totalStars}★`,
          13,
          PALETTE.highlight,
        );
        stars.anchor.set(1, 0);
        stars.position.set(LANE.x + LANE.width - 8, LANE.y + 6);
        this.root.addChild(stars);

        const pending = this.text(
          s.phase === "playing" ? `this run: ${eco.starsIfCleared}★` : "",
          12,
          PALETTE.textDim,
        );
        pending.position.set(LANE.x + 8, LANE.y + 26);
        this.root.addChild(pending);
      }

      if (eco.firstFailureExempt) {
        const exempt = this.text("free first failure — no life lost", 12, PALETTE.won);
        exempt.anchor.set(1, 0);
        exempt.position.set(LANE.x + LANE.width - 8, LANE.y + 26);
        this.root.addChild(exempt);
      }

      // Hard-lock exit (GDD §13): out of lives must never be a dead end.
      if (eco.lockedOut) {
        const lock = this.text("out of lives — waiting for a refill", 13, PALETTE.failed);
        lock.anchor.set(0.5, 0);
        lock.position.set(DESIGN.width / 2, LANE.y + LANE.height - 26);
        this.root.addChild(lock);
      }
    }

    // --- status line + restart ---
    const banner =
      s.phase === "won"
        ? "CLEARED"
        : s.phase === "failed"
          ? `FAILED — ${s.message ?? ""}`
          : (this.rejection ?? s.message ?? "");
    const colour =
      s.phase === "won" ? PALETTE.won : s.phase === "failed" ? PALETTE.failed : PALETTE.textDim;

    const status = this.text(banner, 15, colour);
    status.position.set(STATUS.x, STATUS.y);
    this.root.addChild(status);

    const meta = this.text(
      `${s.levelId}  ${s.mode}  target ${Math.min(s.targetIndex + 1, s.targets.length)}/${s.targets.length}  fails ${s.failures}`,
      12,
      PALETTE.textDim,
    );
    meta.position.set(STATUS.x, STATUS.y + 22);
    this.root.addChild(meta);

    this.root.addChild(
      this.box(
        STATUS.x + STATUS.width - 90,
        STATUS.y + 8,
        90,
        32,
        PALETTE.slotFilled,
        "restart",
        PALETTE.text,
        () => this.emit({ type: "tapRestart" }),
      ),
    );

    // --- hints already owned, re-shown free after a restart (GDD §13) ---
    s.hints.forEach((hint, i) => {
      const y = POOL.y + POOL.height - 46 + i * 16;
      const label = this.text(`◆ ${hint.text}`, 12, PALETTE.highlight);
      label.position.set(POOL.x + 4, y);
      this.root.addChild(label);
    });

    // --- hint shop: absent before 3-6 (§7.6) ---
    if (u.hintShop && eco) {
      this.root.addChild(
        this.box(
          STATUS.x + STATUS.width - 190,
          STATUS.y + 8,
          92,
          32,
          s.shopOpen ? PALETTE.commit : PALETTE.slotFilled,
          `hints ${eco.starsAvailable}★`,
          PALETTE.text,
          () => this.emit({ type: "toggleShop" }),
        ),
      );

      if (s.shopOpen) {
        const panelH = 30 + s.shop.length * 40;
        const panelY = POOL.y + POOL.height - panelH - 4;
        this.root.addChild(
          new Graphics()
            .roundRect(POOL.x, panelY, POOL.width, panelH, 8)
            .fill({ color: 0x22262f, alpha: 0.98 })
            .roundRect(POOL.x, panelY, POOL.width, panelH, 8)
            .stroke({ width: 2, color: PALETTE.highlight }),
        );
        const title = this.text("hints — none reveals a keystone", 12, PALETTE.textDim);
        title.position.set(POOL.x + 8, panelY + 7);
        this.root.addChild(title);

        s.shop.forEach((entry, i) => {
          const y = panelY + 26 + i * 40;
          const enabled = entry.owned || entry.affordable;
          this.root.addChild(
            this.box(
              POOL.x + 8,
              y,
              POOL.width - 16,
              34,
              entry.owned ? PALETTE.operator : enabled ? PALETTE.slotFilled : PALETTE.operatorDim,
              `${entry.label}   ${entry.owned ? "owned" : `${entry.cost}★`}`,
              enabled ? PALETTE.text : PALETTE.textDim,
              () => this.emit({ type: "buyHint", hint: entry.type }),
            ),
          );
        });
      }
    }

    // --- mode selector: absent before 3-10 (§7.6) ---
    if (u.modeSelector) {
      const modes: Mode[] = ["casual", "normal", "expert"];
      modes.forEach((mode, i) => {
        const w = 62;
        const x = STATUS.x + i * (w + 6);
        const active = s.mode === mode;
        this.root.addChild(
          this.box(
            x,
            STATUS.y + 44,
            w,
            26,
            active ? PALETTE.commit : PALETTE.slot,
            mode,
            active ? PALETTE.text : PALETTE.textDim,
            () => this.emit({ type: "selectMode", mode }),
          ),
        );
      });
    }

    // --- blocked fatal move (GDD §6 Casual, §7.5 the scripted trap) ---
    if (s.warning) {
      const w = s.warning;
      const panelY = LANE.y + 40;
      this.root.addChild(
        new Graphics()
          .roundRect(LANE.x + 6, panelY, LANE.width - 12, 150, 8)
          .fill({ color: 0x2b2f3d, alpha: 0.97 })
          .roundRect(LANE.x + 6, panelY, LANE.width - 12, 150, 8)
          .stroke({ width: 3, color: PALETTE.highlight }),
      );

      // §7.5 step 3: one line of text. Not a modal, not a chain of Next.
      const line = this.text(w.line, 19, PALETTE.text);
      line.anchor.set(0.5);
      line.position.set(DESIGN.width / 2, panelY + 34);
      this.root.addChild(line);

      const refused = this.text(
        w.scripted ? `${w.move} looks right. It is not.` : `${w.move} loses the level.`,
        13,
        PALETTE.textDim,
      );
      refused.anchor.set(0.5);
      refused.position.set(DESIGN.width / 2, panelY + 62);
      this.root.addChild(refused);

      if (w.scripted) {
        const free = this.text("rewound free — no star, no life, no failure", 12, PALETTE.won);
        free.anchor.set(0.5);
        free.position.set(DESIGN.width / 2, panelY + 84);
        this.root.addChild(free);
      }

      this.root.addChild(
        this.box(
          DESIGN.width / 2 - 60,
          panelY + 104,
          120,
          32,
          PALETTE.slotFilled,
          w.scripted ? "let me look" : "got it",
          PALETTE.text,
          () => this.emit({ type: "dismissWarning" }),
        ),
      );
    }

    // Terminal state gets a banner across the lane, not just a line of text at
    // the bottom of the board. A player who cannot see why the level stopped
    // will report that it did not stop.
    if (s.phase !== "playing") {
      const won = s.phase === "won";
      const bannerY = LANE.y + LANE.height / 2 - 44;
      this.root.addChild(
        new Graphics()
          .roundRect(LANE.x + 8, bannerY, LANE.width - 16, 88, 8)
          .fill({ color: won ? PALETTE.won : PALETTE.failed, alpha: 0.94 }),
      );
      const headline = this.text(won ? "CLEARED" : "FAILED", 30, PALETTE.text);
      headline.anchor.set(0.5);
      headline.position.set(DESIGN.width / 2, bannerY + 26);
      this.root.addChild(headline);

      const detail = this.text(
        won ? `${s.targets.length}/${s.targets.length} targets` : (s.message ?? ""),
        14,
        PALETTE.text,
      );
      detail.anchor.set(0.5);
      detail.position.set(DESIGN.width / 2, bannerY + 58);
      this.root.addChild(detail);

      const again = this.box(
        DESIGN.width / 2 - 60,
        bannerY + 96,
        120,
        34,
        PALETTE.slotFilled,
        won ? "replay" : "try again",
        PALETTE.text,
        () => this.emit({ type: "tapRestart" }),
      );
      this.root.addChild(again);
    }

    // Equation band backdrop drawn last would cover the row, so draw beneath.
    this.root.addChildAt(
      new Graphics()
        .roundRect(EQUATION.x, EQUATION.y, EQUATION.width, EQUATION.height, 8)
        .fill(PALETTE.slot),
      1,
    );
    this.root.addChildAt(
      new Graphics().roundRect(POOL.x, POOL.y - 6, POOL.width, POOL.height, 8).fill(0x191d25),
      2,
    );
  }
}
