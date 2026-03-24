export type Team = "red" | "blue" | "neutral";
export type ActiveTeam = "red" | "blue";
export type PieceKind =
  | "soldier"
  | "archer"
  | "champion"
  | "leader"
  | "behemoth"
  | "wall";
export type Mode = "setup" | "play";
export type RollScope = "general" | "piece";
export type TurnPhase = "await_roll" | "resolve" | "game_over";

export interface Piece {
  id: string;
  team: Team;
  kind: PieceKind;
}

export interface Position {
  x: number;
  y: number;
}

export interface PiecePlacement {
  piece: Piece;
  x: number;
  y: number;
  wallHits?: 0 | 1;
}

export interface SerializedState {
  size: number;
  turn: ActiveTeam;
  placements: PiecePlacement[];
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface Scores {
  red: number;
  blue: number;
}

export interface TurnState {
  activeTeam: ActiveTeam;
  phase: TurnPhase;
  winner: ActiveTeam | null;
  scope: RollScope | null;
  rolledPieceId: string | null;
  rolledPieceKind: PieceKind | null;
  dice: number[];
  total: number;
  remaining: number;
  spent: boolean;
}

export interface PaletteOption {
  team: Team;
  kind: PieceKind;
}
