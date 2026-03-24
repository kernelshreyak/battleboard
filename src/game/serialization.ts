import {
  MAX_BOARD_SIZE,
  MIN_BOARD_SIZE,
  PIECE_CODE_TO_DEF,
  PIECE_TO_CODE,
} from "./constants";
import type { ActiveTeam, Piece, PiecePlacement, SerializedState } from "./types";

export function clampBoardSize(input: number): number {
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, Math.round(input)));
}

export function serializeState(
  boardSize: number,
  turn: ActiveTeam,
  pieces: Iterable<PiecePlacement>,
): string {
  const placements = [...pieces];
  const rows: string[] = [];

  for (let y = 0; y < boardSize; y += 1) {
    let row = "";
    let emptyCount = 0;

    for (let x = 0; x < boardSize; x += 1) {
      const placement = placements.find((candidate) => candidate.x === x && candidate.y === y);
      if (!placement) {
        emptyCount += 1;
        continue;
      }

      if (emptyCount > 0) {
        row += String(emptyCount);
        emptyCount = 0;
      }

      row +=
        placement.piece.kind === "wall"
          ? placement.wallHits === 1
            ? "X"
            : "x"
          : PIECE_TO_CODE.get(`${placement.piece.team}:${placement.piece.kind}`);
    }

    if (emptyCount > 0) {
      row += String(emptyCount);
    }

    rows.push(row || String(boardSize));
  }

  return `bb1;size=${boardSize};turn=${turn};rows=${rows.join("/")}`;
}

export function parseState(
  input: string,
  makePiece: (team: Piece["team"], kind: Piece["kind"]) => Piece,
): SerializedState {
  const trimmed = input.trim();
  const parts = trimmed.split(";");
  if (parts[0] !== "bb1") {
    throw new Error("Position string must start with bb1.");
  }

  const values = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    values.set(key, rest.join("="));
  }

  const parsedSize = Number(values.get("size"));
  const parsedTurn = values.get("turn");
  const rowsValue = values.get("rows");

  if (!Number.isFinite(parsedSize)) {
    throw new Error("Position string is missing a valid size.");
  }

  const size = clampBoardSize(parsedSize);
  if (parsedTurn !== "red" && parsedTurn !== "blue") {
    throw new Error("Position string must include turn=red or turn=blue.");
  }
  if (!rowsValue) {
    throw new Error("Position string is missing rows data.");
  }

  const rows = rowsValue.split("/");
  if (rows.length !== size) {
    throw new Error(`Expected ${size} rows but found ${rows.length}.`);
  }

  const placements: PiecePlacement[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    let x = 0;
    let digits = "";

    for (const char of row) {
      if (/\d/.test(char)) {
        digits += char;
        continue;
      }

      if (digits) {
        x += Number(digits);
        digits = "";
      }

      const definition = PIECE_CODE_TO_DEF[char];
      if (!definition) {
        throw new Error(`Unknown piece code "${char}" in row ${y + 1}.`);
      }

      if (x >= size) {
        throw new Error(`Row ${y + 1} exceeds board size.`);
      }

      placements.push({
        piece: makePiece(definition.team, definition.kind),
        x,
        y,
        wallHits: char === "X" ? 1 : definition.kind === "wall" ? 0 : undefined,
      });
      x += 1;
    }

    if (digits) {
      x += Number(digits);
    }

    if (x !== size) {
      throw new Error(`Row ${y + 1} has ${x} squares but expected ${size}.`);
    }
  }

  return {
    size,
    turn: parsedTurn as ActiveTeam,
    placements,
  };
}
