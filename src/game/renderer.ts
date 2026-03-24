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
  private readonly boardHost: HTMLDivElement;
  private readonly callbacks: RendererCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: CameraState = { x: 24, y: 24, scale: 1 };
  private readonly pieces = new Map<string, PiecePlacement>();
  private readonly wallImages: { intact: HTMLImageElement | null; cracked: HTMLImageElement | null };
  private boardSize: number;
  private hoveredCell: Position | null = null;
  private selectedPieceId: string | null = null;
  private dragging = false;
  private dragStart:
    | { x: number; y: number; cameraX: number; cameraY: number }
    | null = null;
  private animationFrame = 0;
  private animatingPiece:
    | {
        pieceId: string;
        x: number;
        y: number;
      }
    | null = null;

  private constructor(
    boardHost: HTMLDivElement,
    boardSize: number,
    callbacks: RendererCallbacks,
    wallImages: { intact: HTMLImageElement | null; cracked: HTMLImageElement | null },
  ) {
    this.boardHost = boardHost;
    this.boardSize = boardSize;
    this.callbacks = callbacks;
    this.wallImages = wallImages;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "board-canvas";
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is unavailable.");
    }
    this.context = context;
  }

  static async create(
    boardHost: HTMLDivElement,
    boardSize: number,
    callbacks: RendererCallbacks,
  ): Promise<BoardRenderer> {
    const wallImages = await loadWallImages();
    const renderer = new BoardRenderer(boardHost, boardSize, callbacks, wallImages);
    boardHost.appendChild(renderer.canvas);
    renderer.resize();
    renderer.mount();
    renderer.render();
    return renderer;
  }

  private mount(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = false;
      this.dragStart = {
        x: event.clientX,
        y: event.clientY,
        cameraX: this.camera.x,
        cameraY: this.camera.y,
      };
    });

    window.addEventListener("pointermove", (event) => {
      const boardPosition = this.clientToBoard(event.clientX, event.clientY);
      this.callbacks.onHover(boardPosition);

      if (!this.dragStart) {
        return;
      }

      const deltaX = event.clientX - this.dragStart.x;
      const deltaY = event.clientY - this.dragStart.y;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        this.dragging = true;
      }

      if (this.dragging) {
        this.camera.x = this.dragStart.cameraX + deltaX;
        this.camera.y = this.dragStart.cameraY + deltaY;
        this.render();
      }
    });

    window.addEventListener("pointerup", (event) => {
      const boardPosition = this.clientToBoard(event.clientX, event.clientY);
      if (!this.dragging && boardPosition) {
        this.callbacks.onBoardClick(boardPosition);
      }
      this.dragStart = null;
      this.dragging = false;
    });

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const scaleFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const nextScale = clamp(this.camera.scale * scaleFactor, MIN_ZOOM, MAX_ZOOM);
        const before = this.offsetToBoard(event.offsetX, event.offsetY);
        this.camera.scale = nextScale;
        if (before) {
          this.camera.x = event.offsetX - (before.x * CELL_SIZE + CELL_SIZE / 2) * this.camera.scale;
          this.camera.y = event.offsetY - (before.y * CELL_SIZE + CELL_SIZE / 2) * this.camera.scale;
        }
        this.render();
      },
      { passive: false },
    );
  }

  setBoardSize(boardSize: number): void {
    this.boardSize = boardSize;
    this.render();
  }

  resize(): void {
    const width = Math.max(this.boardHost.clientWidth, 800);
    const height = Math.max(this.boardHost.clientHeight, 600);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
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
    this.render();
  }

  drawBoard(): void {
    this.render();
  }

  drawOverlay(
    hoveredCell: Position | null,
    selectedPieceId: string | null,
    _pieces: Map<string, PiecePlacement>,
  ): void {
    this.hoveredCell = hoveredCell;
    this.selectedPieceId = selectedPieceId;
    this.render();
  }

  clearPieces(): void {
    this.pieces.clear();
    this.render();
  }

  upsertPiece(placement: PiecePlacement): void {
    this.pieces.set(placement.piece.id, placement);
    this.render();
  }

  removePiece(pieceId: string): void {
    this.pieces.delete(pieceId);
    this.render();
  }

  syncPieceView(placement: PiecePlacement): void {
    this.pieces.set(placement.piece.id, placement);
    this.render();
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

    if (waypoints.length < 2) {
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
        this.animatingPiece = null;
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
      this.animatingPiece = {
        pieceId: placement.piece.id,
        x: start.x + dx * t,
        y: start.y + dy * t,
      };
      this.render();

      if (t >= 1) {
        segmentIndex += 1;
        segmentProgress = 0;
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  private render(): void {
    const width = this.boardHost.clientWidth;
    const height = this.boardHost.clientHeight;
    this.context.clearRect(0, 0, width, height);

    this.context.save();
    this.context.translate(this.camera.x, this.camera.y);
    this.context.scale(this.camera.scale, this.camera.scale);

    this.drawBoardSquares();
    this.drawPieces();
    this.drawSelection();

    this.context.restore();
  }

  private drawBoardSquares(): void {
    for (let y = 0; y < this.boardSize; y += 1) {
      for (let x = 0; x < this.boardSize; x += 1) {
        this.context.fillStyle = colorToCss((x + y) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE);
        this.context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        this.context.strokeStyle = colorToCss(GRID_COLOR, 0.45);
        this.context.lineWidth = 1;
        this.context.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  private drawPieces(): void {
    for (const placement of this.pieces.values()) {
      const animated =
        this.animatingPiece && this.animatingPiece.pieceId === placement.piece.id
          ? this.animatingPiece
          : null;
      const centerX = animated ? animated.x : placement.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = animated ? animated.y : placement.y * CELL_SIZE + CELL_SIZE / 2;
      this.drawPiece(placement, centerX, centerY);
    }
  }

  private drawSelection(): void {
    if (this.hoveredCell) {
      this.context.strokeStyle = colorToCss(MOVE_TARGET_COLOR, 0.8);
      this.context.lineWidth = 3;
      this.context.strokeRect(
        this.hoveredCell.x * CELL_SIZE,
        this.hoveredCell.y * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
      );
    }

    if (this.selectedPieceId) {
      const placement = this.pieces.get(this.selectedPieceId);
      if (placement) {
        this.context.strokeStyle = colorToCss(HIGHLIGHT_COLOR, 0.95);
        this.context.lineWidth = 4;
        this.context.strokeRect(
          placement.x * CELL_SIZE,
          placement.y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE,
        );
      }
    }
  }

  private drawPiece(placement: PiecePlacement, centerX: number, centerY: number): void {
    const { piece } = placement;
    if (piece.kind === "wall") {
      this.drawWall(placement, centerX, centerY);
      return;
    }

    const radius = CELL_SIZE * 0.24;
    this.context.fillStyle = colorToCss(TEAM_COLORS[piece.team]);
    this.context.strokeStyle = "#111111";
    this.context.lineWidth = 3;

    if (piece.kind === "soldier" || piece.kind === "archer") {
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.context.fill();
      if (piece.kind === "archer") {
        this.context.beginPath();
        this.context.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
        this.context.stroke();
      }
      return;
    }

    if (piece.kind === "champion" || piece.kind === "behemoth") {
      this.context.beginPath();
      this.context.moveTo(centerX, centerY - radius - 3);
      this.context.lineTo(centerX + radius + 4, centerY + radius + 3);
      this.context.lineTo(centerX - radius - 4, centerY + radius + 3);
      this.context.closePath();
      this.context.fill();
      if (piece.kind === "behemoth") {
        this.context.beginPath();
        this.context.fillStyle = "#111111";
        this.context.arc(centerX, centerY, radius * 0.42, 0, Math.PI * 2);
        this.context.fill();
      }
      return;
    }

    this.context.beginPath();
    this.context.moveTo(centerX, centerY - radius - 5);
    this.context.lineTo(centerX + radius + 5, centerY);
    this.context.lineTo(centerX, centerY + radius + 5);
    this.context.lineTo(centerX - radius - 5, centerY);
    this.context.closePath();
    this.context.fill();
  }

  private drawWall(placement: PiecePlacement, centerX: number, centerY: number): void {
    const image = placement.wallHits === 1 ? this.wallImages.cracked : this.wallImages.intact;
    const size = CELL_SIZE * 0.8;
    if (image) {
      this.context.drawImage(image, centerX - size / 2, centerY - size / 2, size, size);
      return;
    }

    this.context.fillStyle = "#6d655d";
    this.context.strokeStyle = "#463d35";
    this.context.lineWidth = 2;
    roundRect(this.context, centerX - size / 2, centerY - size / 2, size, size, 6);
    this.context.fill();
    this.context.stroke();

    this.context.strokeStyle = "#d9d2c7";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.moveTo(centerX - size * 0.35, centerY - size * 0.1);
    this.context.lineTo(centerX + size * 0.35, centerY - size * 0.1);
    this.context.moveTo(centerX - size * 0.35, centerY + size * 0.08);
    this.context.lineTo(centerX + size * 0.35, centerY + size * 0.08);
    this.context.moveTo(centerX - size * 0.15, centerY - size * 0.5);
    this.context.lineTo(centerX - size * 0.15, centerY + size * 0.5);
    this.context.moveTo(centerX + size * 0.15, centerY - size * 0.5);
    this.context.lineTo(centerX + size * 0.15, centerY + size * 0.5);
    this.context.stroke();

    if (placement.wallHits === 1) {
      this.context.strokeStyle = "#1b1612";
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.moveTo(centerX - size * 0.3, centerY - size * 0.25);
      this.context.lineTo(centerX - size * 0.05, centerY - size * 0.05);
      this.context.lineTo(centerX - size * 0.18, centerY + size * 0.22);
      this.context.lineTo(centerX + size * 0.12, centerY + size * 0.34);
      this.context.stroke();
    }
  }

  private clientToBoard(clientX: number, clientY: number): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.offsetToBoard(clientX - rect.left, clientY - rect.top);
  }

  private offsetToBoard(offsetX: number, offsetY: number): Position | null {
    const localX = (offsetX - this.camera.x) / this.camera.scale;
    const localY = (offsetY - this.camera.y) / this.camera.scale;
    const x = Math.floor(localX / CELL_SIZE);
    const y = Math.floor(localY / CELL_SIZE);

    if (x < 0 || y < 0 || x >= this.boardSize || y >= this.boardSize) {
      return null;
    }
    return { x, y };
  }
}

async function loadWallImages(): Promise<{
  intact: HTMLImageElement | null;
  cracked: HTMLImageElement | null;
}> {
  const [intact, cracked] = await Promise.all([
    loadImage("/assets/wall-intact.svg"),
    loadImage("/assets/wall-cracked.svg"),
  ]);
  return { intact, cracked };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function colorToCss(color: number, alpha = 1): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
