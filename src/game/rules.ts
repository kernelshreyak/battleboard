import { PIECE_LABELS, PIECE_SCORES } from "./constants";
import type {
  ActiveTeam,
  PieceKind,
  PiecePlacement,
  Position,
  TurnState,
} from "./types";

export function getDiceCountForPiece(kind: PieceKind): number {
  void kind;
  return 1;
}

export function canPieceUseOwnRoll(kind: PieceKind): boolean {
  return kind !== "leader";
}

export function canPieceAttack(kind: PieceKind): boolean {
  return (
    kind === "soldier" ||
    kind === "archer" ||
    kind === "champion" ||
    kind === "behemoth"
  );
}

export function buildPath(from: Position, to: Position): Position[] {
  const steps: Position[] = [];
  const deltaX = Math.sign(to.x - from.x);
  const deltaY = Math.sign(to.y - from.y);
  let currentX = from.x;
  let currentY = from.y;

  while (currentX !== to.x) {
    currentX += deltaX;
    steps.push({ x: currentX, y: currentY });
  }

  while (currentY !== to.y) {
    currentY += deltaY;
    steps.push({ x: currentX, y: currentY });
  }

  return steps;
}

export function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

export function isStraightLine(from: Position, to: Position): boolean {
  return from.x === to.x || from.y === to.y;
}

export function getStraightLineSquares(from: Position, to: Position): Position[] {
  if (!isStraightLine(from, to)) {
    return [];
  }

  const squares: Position[] = [];
  const deltaX = Math.sign(to.x - from.x);
  const deltaY = Math.sign(to.y - from.y);
  let currentX = from.x;
  let currentY = from.y;

  while (currentX !== to.x || currentY !== to.y) {
    currentX += deltaX;
    currentY += deltaY;
    squares.push({ x: currentX, y: currentY });
  }

  return squares;
}

export function getBlockingPiece(
  path: Position[],
  movingPieceId: string,
  findPieceAt: (position: Position) => PiecePlacement | undefined,
): PiecePlacement | null {
  for (let index = 0; index < path.length - 1; index += 1) {
    const occupant = findPieceAt(path[index]);
    if (occupant && occupant.piece.id !== movingPieceId) {
      return occupant;
    }
  }
  return null;
}

export function canUsePieceForCurrentRoll(
  piece: PiecePlacement,
  turnState: TurnState,
): boolean {
  if (piece.piece.team !== turnState.activeTeam) {
    return false;
  }
  if (turnState.scope === "general") {
    return true;
  }
  return turnState.rolledPieceId === piece.piece.id;
}

export function isFlexibleAttack(kind: PieceKind): boolean {
  return kind === "champion" || kind === "behemoth";
}

export function requiresMoveOnCapture(kind: PieceKind): boolean {
  return kind === "soldier" || kind === "champion";
}

export function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

export function getCaptureMessage(
  attacker: PiecePlacement,
  defender: PiecePlacement,
  remaining: number,
): string {
  const points = PIECE_SCORES[defender.piece.kind];
  const remainingText = `${remaining} point${remaining === 1 ? "" : "s"} remain.`;

  if (attacker.piece.kind === "champion") {
    return `${attacker.piece.team} champion captured ${defender.piece.team} ${defender.piece.kind} for ${points} points. ${remainingText}`;
  }
  if (attacker.piece.kind === "behemoth") {
    return `${attacker.piece.team} behemoth blasted ${defender.piece.team} ${defender.piece.kind} for ${points} points. ${remainingText}`;
  }
  if (attacker.piece.kind === "archer") {
    return `${attacker.piece.team} archer captured ${defender.piece.team} ${defender.piece.kind} for ${points} points.`;
  }
  if (attacker.piece.kind === "soldier") {
    return `${attacker.piece.team} soldier captured ${defender.piece.team} ${defender.piece.kind} for ${points} points.`;
  }
  return `${PIECE_LABELS[attacker.piece.kind]} captured ${PIECE_LABELS[defender.piece.kind]}.`;
}

export function getWallMessage(
  attacker: PiecePlacement,
  cracked: boolean,
  remaining: number,
): string {
  if (cracked) {
    return `${attacker.piece.team} ${attacker.piece.kind} cracked the wall. ${remaining} point${remaining === 1 ? "" : "s"} remain.`;
  }
  return `${attacker.piece.team} ${attacker.piece.kind} destroyed the wall.`;
}

export function assertActiveTeam(team: PiecePlacement["piece"]["team"]): ActiveTeam {
  return team as ActiveTeam;
}
