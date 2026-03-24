import type { PaletteOption, PieceKind, Team } from "./types";

export const CELL_SIZE = 48;
export const MIN_BOARD_SIZE = 4;
export const DEFAULT_BOARD_SIZE = 20;
export const MAX_BOARD_SIZE = 200;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 1.12;

export const TEAM_COLORS: Record<Team, number> = {
  red: 0xd64045,
  blue: 0x4a8ee8,
  neutral: 0x7b6f63,
};

export const GRID_COLOR = 0x30425e;
export const LIGHT_SQUARE = 0xf3efe3;
export const DARK_SQUARE = 0xd8ccb8;
export const HIGHLIGHT_COLOR = 0xffd166;
export const MOVE_TARGET_COLOR = 0x06d6a0;

export const PIECE_SCORES: Record<PieceKind, number> = {
  soldier: 1,
  archer: 2,
  champion: 8,
  behemoth: 20,
  leader: 50,
  wall: 0,
};

export const PIECE_CODE_TO_DEF: Record<
  string,
  { team: Team; kind: PieceKind }
> = {
  s: { team: "red", kind: "soldier" },
  a: { team: "red", kind: "archer" },
  c: { team: "red", kind: "champion" },
  l: { team: "red", kind: "leader" },
  b: { team: "red", kind: "behemoth" },
  x: { team: "neutral", kind: "wall" },
  X: { team: "neutral", kind: "wall" },
  S: { team: "blue", kind: "soldier" },
  A: { team: "blue", kind: "archer" },
  C: { team: "blue", kind: "champion" },
  L: { team: "blue", kind: "leader" },
  B: { team: "blue", kind: "behemoth" },
};

export const PIECE_TO_CODE = new Map<string, string>(
  Object.entries(PIECE_CODE_TO_DEF).map(([code, def]) => [
    `${def.team}:${def.kind}`,
    code,
  ]),
);

export const PIECE_LABELS: Record<PieceKind, string> = {
  soldier: "Soldier",
  archer: "Archer",
  champion: "Champion",
  leader: "Leader",
  behemoth: "Behemoth",
  wall: "Wall",
};

export const RED_PALETTE: PaletteOption[] = [
  { team: "red", kind: "soldier" },
  { team: "red", kind: "archer" },
  { team: "red", kind: "champion" },
  { team: "red", kind: "leader" },
  { team: "red", kind: "behemoth" },
];

export const BLUE_PALETTE: PaletteOption[] = [
  { team: "blue", kind: "soldier" },
  { team: "blue", kind: "archer" },
  { team: "blue", kind: "champion" },
  { team: "blue", kind: "leader" },
  { team: "blue", kind: "behemoth" },
];

export const WALL_PALETTE: PaletteOption = { team: "neutral", kind: "wall" };
