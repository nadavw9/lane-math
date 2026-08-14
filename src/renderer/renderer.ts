import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

import type { BinaryOp, UnaryOp } from "../solver/index.js";
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

      const count = remaining === null ? "" : `\n${remaining}`;
      this.root.addChild(
        this.box(
          r.x,
          r.y,
          r.w,
          r.h,
          enabled && active ? PALETTE.operator : PALETTE.operatorDim,
          `${LABEL[op] ?? op}${count}`,
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
          transformable ? PALETTE.highlight : undefined,
        ),
      );
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
