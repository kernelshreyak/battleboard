import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import {
  CELL_SIZE,
  DARK_SQUARE,
  GRID_COLOR,
  HIGHLIGHT_COLOR,
  LIGHT_SQUARE,
  MAX_ZOOM,
  MIN_ZOOM,
  MOVE_TARGET_COLOR,
  TEAM_COLORS,
  ZOOM_STEP,
} from "./constants";
import type { CameraState, PiecePlacement, Position } from "./types";
import { buildPath } from "./rules";

interface RendererCallbacks {
  onBoardClick: (position: Position) => void;
  onHover: (position: Position | null) => void;
}

export class BoardRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly boardLayer = new Graphics();
  private readonly pieceLayer = new Container();
  private readonly overlayLayer = new Graphics();
  private readonly camera: CameraState = { x: 24, y: 24, scale: 1 };
  private readonly pieceViews = new Map<string, Container>();
  private readonly callbacks: RendererCallbacks;
  private readonly boardHost: HTMLDivElement;
  private readonly wallTextures: { intact: Texture; cracked: Texture };
  private boardSize: number;
  private dragging = false;
  private dragStart:
    | { x: number; y: number; cameraX: number; cameraY: number }
    | null = null;
  private animationFrame = 0;

  private constructor(
    boardHost: HTMLDivElement,
    boardSize: number,
    callbacks: RendererCallbacks,
    wallTextures: { intact: Texture; cracked: Texture },
  ) {
    this.boardHost = boardHost;
    this.boardSize = boardSize;
    this.callbacks = callbacks;
    this.wallTextures = wallTextures;
  }

  static async create(
    boardHost: HTMLDivElement,
    boardSize: number,
    callbacks: RendererCallbacks,
  ): Promise<BoardRenderer> {
    const wallTextures = {
      intact: await Assets.load<Texture>("/assets/wall-intact.svg"),
      cracked: await Assets.load<Texture>("/assets/wall-cracked.svg"),
    };

    const renderer = new BoardRenderer(boardHost, boardSize, callbacks, wallTextures);
    await renderer.app.init({
      antialias: true,
      background: 0xf4efe3,
      resizeTo: boardHost,
    });
    boardHost.appendChild(renderer.app.canvas);
    renderer.mount();
    return renderer;
  }

  private mount(): void {
    this.world.eventMode = "static";
    this.app.stage.addChild(this.world);
    this.world.addChild(this.boardLayer, this.overlayLayer, this.pieceLayer);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
      this.dragging = false;
      this.dragStart = {
        x: event.global.x,
        y: event.global.y,
        cameraX: this.camera.x,
        cameraY: this.camera.y,
      };
    });

    this.app.stage.on("pointermove", (event: FederatedPointerEvent) => {
      const boardPosition = this.screenToBoard(event.global.x, event.global.y);
      this.callbacks.onHover(boardPosition);

      if (!this.dragStart) {
        return;
      }

      const deltaX = event.global.x - this.dragStart.x;
      const deltaY = event.global.y - this.dragStart.y;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        this.dragging = true;
      }

      if (this.dragging) {
        this.camera.x = this.dragStart.cameraX + deltaX;
        this.camera.y = this.dragStart.cameraY + deltaY;
        this.applyCamera();
      }
    });

    this.app.stage.on("pointerup", (event: FederatedPointerEvent) => {
      const boardPosition = this.screenToBoard(event.global.x, event.global.y);
      if (!this.dragging && boardPosition) {
        this.callbacks.onBoardClick(boardPosition);
      }
      this.dragStart = null;
      this.dragging = false;
    });

    this.app.stage.on("pointerupoutside", () => {
      this.dragStart = null;
      this.dragging = false;
    });

    this.app.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const scaleFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const nextScale = clamp(this.camera.scale * scaleFactor, MIN_ZOOM, MAX_ZOOM);
        const before = this.screenToBoard(event.offsetX, event.offsetY);
        this.camera.scale = nextScale;
        this.applyCamera();
        if (before) {
          this.camera.x =
            event.offsetX - (before.x * CELL_SIZE + CELL_SIZE / 2) * this.camera.scale;
          this.camera.y =
            event.offsetY - (before.y * CELL_SIZE + CELL_SIZE / 2) * this.camera.scale;
          this.applyCamera();
        }
      },
      { passive: false },
    );
  }

  setBoardSize(boardSize: number): void {
    this.boardSize = boardSize;
  }

  drawBoard(): void {
    this.boardLayer.clear();
    this.boardLayer.rect(0, 0, this.boardSize * CELL_SIZE, this.boardSize * CELL_SIZE).fill({
      color: 0x0e1622,
    });

    for (let y = 0; y < this.boardSize; y += 1) {
      for (let x = 0; x < this.boardSize; x += 1) {
        const squareColor = (x + y) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
        this.boardLayer
          .rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          .fill({ color: squareColor });
      }
    }

    for (let i = 0; i <= this.boardSize; i += 1) {
      const offset = i * CELL_SIZE;
      this.boardLayer
        .moveTo(offset, 0)
        .lineTo(offset, this.boardSize * CELL_SIZE)
        .stroke({ color: GRID_COLOR, width: 1, alpha: 0.45 });
      this.boardLayer
        .moveTo(0, offset)
        .lineTo(this.boardSize * CELL_SIZE, offset)
        .stroke({ color: GRID_COLOR, width: 1, alpha: 0.45 });
    }
  }

  drawOverlay(
    hoveredCell: Position | null,
    selectedPieceId: string | null,
    pieces: Map<string, PiecePlacement>,
  ): void {
    this.overlayLayer.clear();

    if (hoveredCell) {
      this.overlayLayer
        .rect(hoveredCell.x * CELL_SIZE, hoveredCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        .stroke({ color: MOVE_TARGET_COLOR, width: 3, alpha: 0.8 });
    }

    if (selectedPieceId) {
      const placement = pieces.get(selectedPieceId);
      if (placement) {
        this.overlayLayer
          .rect(placement.x * CELL_SIZE, placement.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          .stroke({ color: HIGHLIGHT_COLOR, width: 4, alpha: 0.95 });
      }
    }
  }

  clearPieces(): void {
    for (const pieceId of [...this.pieceViews.keys()]) {
      this.removePiece(pieceId);
    }
  }

  upsertPiece(placement: PiecePlacement): void {
    const previousView = this.pieceViews.get(placement.piece.id);
    if (previousView) {
      previousView.destroy({ children: true });
    }
    const nextView = this.createPieceView(placement);
    this.pieceViews.set(placement.piece.id, nextView);
    this.pieceLayer.addChild(nextView);
    this.syncPieceView(placement);
  }

  removePiece(pieceId: string): void {
    const view = this.pieceViews.get(pieceId);
    if (view) {
      view.destroy({ children: true });
    }
    this.pieceViews.delete(pieceId);
  }

  syncPieceView(placement: PiecePlacement): void {
    const view = this.pieceViews.get(placement.piece.id);
    if (!view) {
      return;
    }
    view.position.set(
      placement.x * CELL_SIZE + CELL_SIZE / 2,
      placement.y * CELL_SIZE + CELL_SIZE / 2,
    );
  }

  animateMove(
    placement: PiecePlacement,
    target: Position,
    onComplete: () => void,
  ): void {
    const path = buildPath({ x: placement.x, y: placement.y }, target);
    const waypoints = [
      {
        x: placement.x * CELL_SIZE + CELL_SIZE / 2,
        y: placement.y * CELL_SIZE + CELL_SIZE / 2,
      },
      ...path.map((step) => ({
        x: step.x * CELL_SIZE + CELL_SIZE / 2,
        y: step.y * CELL_SIZE + CELL_SIZE / 2,
      })),
    ];

    const view = this.pieceViews.get(placement.piece.id);
    if (!view || waypoints.length < 2) {
      placement.x = target.x;
      placement.y = target.y;
      this.syncPieceView(placement);
      onComplete();
      return;
    }

    cancelAnimationFrame(this.animationFrame);
    let segmentIndex = 0;
    let segmentProgress = 0;
    const speed = 10;

    const tick = (): void => {
      const start = waypoints[segmentIndex];
      const end = waypoints[segmentIndex + 1];

      if (!end) {
        placement.x = target.x;
        placement.y = target.y;
        this.syncPieceView(placement);
        onComplete();
        return;
      }

      segmentProgress += speed;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.hypot(dx, dy) || 1;
      const t = Math.min(segmentProgress / distance, 1);
      view.position.set(start.x + dx * t, start.y + dy * t);

      if (t >= 1) {
        segmentIndex += 1;
        segmentProgress = 0;
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  fitCameraToBoard(padding = 32): void {
    const hostWidth = this.boardHost.clientWidth;
    const hostHeight = this.boardHost.clientHeight;

    if (hostWidth <= 0 || hostHeight <= 0) {
      return;
    }

    const usableWidth = Math.max(hostWidth - padding * 2, CELL_SIZE * 6);
    const usableHeight = Math.max(hostHeight - padding * 2, CELL_SIZE * 6);
    const boardPixels = this.boardSize * CELL_SIZE;
    const nextScale = clamp(
      Math.min(usableWidth / boardPixels, usableHeight / boardPixels),
      MIN_ZOOM,
      1,
    );

    this.camera.scale = nextScale;
    this.camera.x = (hostWidth - boardPixels * nextScale) / 2;
    this.camera.y = (hostHeight - boardPixels * nextScale) / 2;
    this.applyCamera();
  }

  private applyCamera(): void {
    this.world.position.set(this.camera.x, this.camera.y);
    this.world.scale.set(this.camera.scale);
  }

  private screenToBoard(globalX: number, globalY: number): Position | null {
    const localX = (globalX - this.camera.x) / this.camera.scale;
    const localY = (globalY - this.camera.y) / this.camera.scale;
    const x = Math.floor(localX / CELL_SIZE);
    const y = Math.floor(localY / CELL_SIZE);

    if (x < 0 || y < 0 || x >= this.boardSize || y >= this.boardSize) {
      return null;
    }

    return { x, y };
  }

  private createPieceView(placement: PiecePlacement): Container {
    const { piece } = placement;
    const container = new Container();
    const body = new Graphics();
    const badge = new Graphics();

    if (piece.kind === "wall") {
      const sprite = new Sprite(
        placement.wallHits === 1 ? this.wallTextures.cracked : this.wallTextures.intact,
      );
      sprite.anchor.set(0.5);
      sprite.width = CELL_SIZE * 0.8;
      sprite.height = CELL_SIZE * 0.8;
      container.addChild(sprite);
      return container;
    }

    const fill = TEAM_COLORS[piece.team];
    const radius = CELL_SIZE * 0.24;
    body.clear();

    if (piece.kind === "soldier" || piece.kind === "archer") {
      body.circle(0, 0, radius).fill({ color: fill });
    } else if (piece.kind === "champion" || piece.kind === "behemoth") {
      body
        .poly([
          { x: 0, y: -radius - 3 },
          { x: radius + 4, y: radius + 3 },
          { x: -radius - 4, y: radius + 3 },
        ])
        .fill({ color: fill });
    } else {
      body
        .poly([
          { x: 0, y: -radius - 5 },
          { x: radius + 5, y: 0 },
          { x: 0, y: radius + 5 },
          { x: -radius - 5, y: 0 },
        ])
        .fill({ color: fill });
    }

    if (piece.kind === "behemoth") {
      badge.circle(0, 0, radius * 0.42).fill({ color: 0x111111 });
    }

    if (piece.kind === "archer") {
      badge.circle(0, 0, radius * 0.58).stroke({
        color: 0x111111,
        width: 3,
      });
    }

    container.addChild(body, badge);
    return container;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
