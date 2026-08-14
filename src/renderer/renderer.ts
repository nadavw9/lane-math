import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

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
import { RejectPulse, Shatter } from "./effects.js";
import { emptySlot, numberTile, operatorToken, targetPlate } from "./tokens.js";

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
  /** Wallpaper, below everything and untouched by a board redraw. */
  private readonly background = new Container();
  private readonly root = new Container();
  /** Effects live above the board and are not cleared by a redraw. */
  private readonly fx = new Container();
  private world = 0;
  private state: ViewState | null = null;
  private rejection: string | null = null;
  private emit: (input: InputEvent) => void = () => {};

  /** Where each live tile is drawn, so a shatter can start from the right place. */
  private readonly tileBounds = new Map<number, { x: number; y: number; w: number; h: number }>();
  /** Outlines where consumed tiles used to sit (§9.3). */
  private ghosts: { x: number; y: number; w: number; h: number }[] = [];
  private readonly shatters: Shatter[] = [];
  private reject: RejectPulse | null = null;
  private rejectOffset = { dx: 0, dy: 0, glow: 0 };
  private lastPhase: string = "playing";

  private get rejecting(): boolean {
    return this.reject !== null;
  }

  /**
   * One pre-rendered image per world (GDD §9.1) — the only raster assets in the
   * game. Backgrounds are wallpaper: nothing traverses them and nothing
   * scrolls, so they are a single image rather than a composited playfield.
   */
  async setWorld(world: number): Promise<void> {
    if (this.world === world) return;
    this.world = world;

    try {
      const texture = await Assets.load<Texture>(`/assets/bg/world-${world}.webp`);
      this.background.removeChildren();
      const sprite = new Sprite(texture);
      // Cover the design surface, cropping from the edges for shorter frames
      // exactly as §9.1 specifies.
      const scale = Math.max(DESIGN.width / texture.width, DESIGN.height / texture.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5);
      sprite.position.set(DESIGN.width / 2, DESIGN.height / 2);
      this.background.addChild(sprite);
    } catch {
      // A missing background must not take the game down; the flat fill behind
      // it is already legible. CI is what refuses to ship one (brightness gate).
      this.background.removeChildren();
    }
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: DESIGN.width,
      height: DESIGN.height,
      background: PALETTE.background,
      antialias: false,
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.background);
    this.app.stage.addChild(this.root);
    this.app.stage.addChild(this.fx);

    // Effects tick independently of state changes: a shatter has to keep
    // playing while the board sits still underneath it.
    this.app.ticker.add(({ deltaMS }) => this.tick(deltaMS));

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
        const previous = this.state;
        this.state = command.state;
        if (commands.some((c) => c.type === "reject") === false) this.rejection = null;
        this.reactTo(previous, command.state);
      }
    }
    this.draw();
  }

  /**
   * Turn state transitions into effects.
   *
   * The Renderer notices what changed rather than being told — the Director
   * emits game state and stays free of animation concerns.
   */
  private reactTo(previous: ViewState | null, next: ViewState): void {
    if (!previous || previous.levelId !== next.levelId) {
      this.ghosts = [];
      this.shatters.length = 0;
      this.fx.removeChildren();
      this.reject = null;
      this.lastPhase = next.phase;
      return;
    }

    // A target was cleared: the tiles that paid for it shatter into it (§9.3).
    if (next.targetIndex > previous.targetIndex) {
      const consumed = previous.tiles.filter(
        (t) => !t.consumed && next.tiles.find((n) => n.id === t.id)?.consumed === true,
      );
      const slot = targetSlot(previous.targetIndex, next.targets.length);
      const targetX = slot.x + slot.w / 2;
      const targetY = slot.y + slot.h / 2;

      for (const tile of consumed) {
        const bounds = this.tileBounds.get(tile.id);
        if (!bounds) continue;
        this.ghosts.push(bounds);
        this.spawnShatter(bounds, PALETTE.tile, targetX, targetY);
      }
      // The operator is destroyed with them — it was spent too.
      const opSlot = equationSlot(1);
      this.spawnShatter(
        { x: opSlot.x, y: opSlot.y, w: opSlot.w, h: opSlot.h },
        PALETTE.operator,
        targetX,
        targetY,
      );
    }

    // The lane refuses the front target (§9.4). No banner — the board says it.
    if (next.phase === "failed" && this.lastPhase !== "failed") {
      this.reject = new RejectPulse();
    }
    if (next.phase !== "failed") this.reject = null;
    this.lastPhase = next.phase;
  }

  private spawnShatter(
    bounds: { x: number; y: number; w: number; h: number },
    colour: number,
    targetX: number,
    targetY: number,
  ): void {
    const shatter = new Shatter({ ...bounds, colour, targetX, targetY });
    this.shatters.push(shatter);
    this.fx.addChild(shatter.container);
  }

  private tick(deltaMs: number): void {
    let dirty = false;

    for (let i = this.shatters.length - 1; i >= 0; i--) {
      if (!this.shatters[i]!.update(deltaMs)) this.shatters.splice(i, 1);
    }

    if (this.reject) {
      const sample = this.reject.sample(deltaMs);
      this.rejectOffset = { dx: sample.dx, dy: sample.dy, glow: sample.glow };
      dirty = true;
      if (!sample.alive) {
        // Settle in place. The target stays refused; it simply stops shaking.
        this.rejectOffset = { dx: 0, dy: 0, glow: 0.35 };
      }
    }

    if (dirty) this.draw();
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

  /** Place a procedural token and make it tappable. */
  private place(
    token: Container,
    x: number,
    y: number,
    onTap?: () => void,
  ): Container {
    token.position.set(x, y);
    if (onTap) {
      token.eventMode = "static";
      token.cursor = "pointer";
      token.on("pointertap", onTap);
    }
    this.root.addChild(token);
    return token;
  }

  private draw(): void {
    this.root.removeChildren();
    const s = this.state;
    if (!s) return;

    // --- lane: the FULL target queue, visible from level open (GDD §4.2) ---
    // Translucent so the world background reads through. The brightness gate
    // measures tokens against that background, so covering it with an opaque
    // panel would make the gate judge something the player never sees.
    this.root.addChild(
      new Graphics()
        .roundRect(LANE.x, LANE.y, LANE.width, LANE.height, 8)
        .fill({ color: PALETTE.lane, alpha: 0.55 }),
    );
    for (let i = s.targets.length - 1; i >= 0; i--) {
      const slot = targetSlot(i, s.targets.length);
      const cleared = i < s.targetIndex;
      const front = i === s.targetIndex;

      // §9.4: the front target shudders and refuses to advance when the lane
      // rejects it. It never leaves its slot — not advancing IS the message.
      const shove = front && this.rejecting ? this.rejectOffset : { dx: 0, dy: 0, glow: 0 };

      this.place(
        targetPlate(slot.w, slot.h, String(s.targets[i]), {
          fill: cleared
            ? PALETTE.targetCleared
            : front
              ? this.rejecting
                ? PALETTE.failed
                : PALETTE.targetFront
              : PALETTE.targetPlate,
          text: cleared ? PALETTE.tokenInkDim : PALETTE.tokenInk,
          bevel: 0, // recessed: targets are spent ON, not picked up
          outline: front
            ? this.rejecting
              ? PALETTE.failed
              : PALETTE.highlight
            : undefined,
        }),
        slot.x + shove.dx,
        slot.y + shove.dy,
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
    slotSpecs.forEach(([text, filled, index]) => {
      const r = equationSlot(index);
      const tap = () => this.emit({ type: "tapSlot", index });
      if (!filled) {
        this.place(emptySlot(r.w, r.h), r.x, r.y, tap);
        return;
      }
      // A filled slot keeps the SHAPE of what is in it: circle for the
      // operator, rounded square for a number. The row reads as a sentence.
      const token =
        index === 1
          ? operatorToken(Math.min(r.w, r.h), text, {
              fill: PALETTE.operator,
              text: PALETTE.tokenInk,
              bevel: 1,
            })
          : numberTile(r.w, r.h, text, {
              fill: PALETTE.tile,
              text: PALETTE.tokenInk,
              bevel: 1,
            });
      this.place(token, r.x + (index === 1 ? (r.w - Math.min(r.w, r.h)) / 2 : 0), r.y, tap);
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

      // §3.5: bold-active is ALWAYS paired with dim-inactive. Weight change
      // alone is easy to miss and poor for low-vision players.
      const size = Math.min(r.w, r.h + 6);
      this.place(
        operatorToken(size, LABEL[op] ?? op, {
          fill: enabled && active ? PALETTE.operator : PALETTE.operatorDim,
          text: enabled && active ? PALETTE.tokenInk : PALETTE.tokenInkDim,
          bevel: enabled && active ? 1 : 0.2,
          outline: s.transformOp === op ? PALETTE.highlight : undefined,
        }),
        r.x + (r.w - size) / 2,
        r.y,
        spent
          ? undefined
          : isUnary
            ? () => this.emit({ type: "tapUnary", op: op as UnaryOp })
            : () => this.emit({ type: "tapOperator", op: op as BinaryOp }),
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

      this.place(
        numberTile(r.w, r.h, String(tile.value), {
          fill: dimmed
            ? PALETTE.tileDim
            : tile.transformed
              ? PALETTE.tileTransformed
              : PALETTE.tile,
          text: dimmed ? PALETTE.tokenInkDim : PALETTE.tokenInk,
          // Dimmed tiles lose their bevel too, so "inactive" is carried by
          // form as well as colour.
          bevel: dimmed ? 0.15 : 1,
          outline:
            transformable || pulsed.has(tile.id) || hinted.has(tile.id)
              ? PALETTE.highlight
              : undefined,
        }),
        r.x,
        r.y,
        () => this.emit({ type: "tapTile", id: tile.id }),
      );
      this.tileBounds.set(tile.id, { x: r.x, y: r.y, w: r.w, h: r.h });
    }

    // §9.3, prototyped: a ghost outline where a consumed tile used to be.
    // KEPT — on a 13-16 tile World 4 board the gaps alone read as a shuffled
    // layout rather than as loss, and the ghosts make "gone forever" legible.
    if (this.ghosts.length > 0) {
      for (const ghost of this.ghosts) {
        this.root.addChild(
          new Graphics()
            .roundRect(ghost.x, ghost.y, ghost.w, ghost.h, Math.min(ghost.w, ghost.h) * 0.22)
            .stroke({ width: 2, color: PALETTE.tile, alpha: 0.22 }),
        );
      }
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
    // §9.4: no "no solution exists" text. During play this line carries
    // rejections and confirmations; on failure the board has already said it.
    const banner = s.phase === "failed" ? "" : (this.rejection ?? s.message ?? "");
    const colour = s.phase === "won" ? PALETTE.won : PALETTE.textDim;

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

    // GDD §9.4: NO failure banner. The lane rejecting the number is the
    // message, and it is legible on the board — the front target shudders,
    // refuses to advance, and the pool visibly cannot feed it. Text is a
    // fallback for when the visual fails, not the primary channel.
    //
    // A win still needs an exit, so the cleared state offers one quietly.
    if (s.phase === "won") {
      const bannerY = LANE.y + LANE.height / 2 - 30;
      this.root.addChild(
        new Graphics()
          .roundRect(LANE.x + 20, bannerY, LANE.width - 40, 60, 10)
          .fill({ color: PALETTE.won, alpha: 0.92 }),
      );
      const headline = this.text("CLEARED", 24, PALETTE.text);
      headline.anchor.set(0.5);
      headline.position.set(DESIGN.width / 2, bannerY + 30);
      this.root.addChild(headline);

      this.root.addChild(
        this.box(
          DESIGN.width / 2 - 60,
          bannerY + 72,
          120,
          34,
          PALETTE.slotFilled,
          "replay",
          PALETTE.text,
          () => this.emit({ type: "tapRestart" }),
        ),
      );
    }

    // Failure adds no button of its own: `restart` already sits in the status
    // band, and a second control over the equation row both collides with it
    // and re-narrates a loss the board has already communicated (§9.4).

    // Equation band backdrop drawn last would cover the row, so draw beneath.
    this.root.addChildAt(
      new Graphics()
        .roundRect(EQUATION.x, EQUATION.y, EQUATION.width, EQUATION.height, 8)
        .fill({ color: PALETTE.slot, alpha: 0.6 }),
      1,
    );
    this.root.addChildAt(
      new Graphics()
        .roundRect(POOL.x, POOL.y - 6, POOL.width, POOL.height, 8)
        .fill({ color: 0x191d25, alpha: 0.5 }),
      2,
    );
  }
}
