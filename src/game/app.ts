import {
  BLUE_PALETTE,
  DEFAULT_BOARD_SIZE,
  PIECE_LABELS,
  PIECE_SCORES,
  RED_PALETTE,
  WALL_PALETTE,
} from "./constants";
import {
  assertActiveTeam,
  canPieceAttack,
  canPieceUseOwnRoll,
  canUsePieceForCurrentRoll,
  getBlockingPiece,
  getCaptureMessage,
  getDiceCountForPiece,
  getManhattanDistance,
  getStraightLineSquares,
  getWallMessage,
  isFlexibleAttack,
  isStraightLine,
  requiresMoveOnCapture,
  rollDice,
} from "./rules";
import { clampBoardSize, parseState, serializeState } from "./serialization";
import { getAppTemplate } from "./template";
import type {
  ActiveTeam,
  Mode,
  PaletteOption,
  Piece,
  PieceKind,
  PiecePlacement,
  Position,
  Scores,
  Team,
  TurnState,
} from "./types";
import { BoardRenderer } from "./renderer";

interface AppElements {
  boardHost: HTMLDivElement;
  boardSizeInput: HTMLInputElement;
  positionInput: HTMLTextAreaElement;
  statusMessage: HTMLParagraphElement;
  modeTitle: HTMLElement;
  modeDescription: HTMLElement;
  paletteGrid: HTMLDivElement;
  boardSizeField: HTMLElement;
  paletteSection: HTMLElement;
  setupActions: HTMLElement;
  playControls: HTMLElement;
  turnSummary: HTMLElement;
  rollDetail: HTMLElement;
  rollTotalValue: HTMLElement;
  remainingPointsValue: HTMLElement;
  redScoreValue: HTMLElement;
  blueScoreValue: HTMLElement;
  modeButtons: HTMLButtonElement[];
  clearSelectionButton: HTMLButtonElement;
  clearBoardButton: HTMLButtonElement;
  startGameButton: HTMLButtonElement;
  loadPositionButton: HTMLButtonElement;
  copyPositionButton: HTMLButtonElement;
  rollGeneralButton: HTMLButtonElement;
  rollSelectedButton: HTMLButtonElement;
  endTurnButton: HTMLButtonElement;
  viewRulesButton: HTMLButtonElement;
  rulesModal: HTMLDialogElement;
  closeRulesButton: HTMLButtonElement;
}

export async function createBattleboardApp(
  root: HTMLDivElement,
): Promise<void> {
  root.innerHTML = getAppTemplate();
  const elements = getElements();

  let boardSize = DEFAULT_BOARD_SIZE;
  let mode: Mode = "setup";
  let turn: ActiveTeam = "red";
  let selectedPalette: PaletteOption | null = RED_PALETTE[0];
  let selectedPieceId: string | null = null;
  let hoveredCell: Position | null = null;
  let pieceIdCounter = 0;

  const pieces = new Map<string, PiecePlacement>();
  const scores: Scores = { red: 0, blue: 0 };
  const turnState: TurnState = {
    activeTeam: "red",
    phase: "await_roll",
    winner: null,
    scope: null,
    rolledPieceId: null,
    rolledPieceKind: null,
    dice: [],
    total: 0,
    remaining: 0,
    spent: false,
  };

  const renderer = await BoardRenderer.create(elements.boardHost, boardSize, {
    onBoardClick,
    onHover: (position) => {
      hoveredCell = position;
      drawOverlay();
    },
  });

  function must<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing required element: ${selector}`);
    }
    return element;
  }

  function getElements(): AppElements {
    return {
      boardHost: must("#board-host"),
      boardSizeInput: must("#board-size"),
      positionInput: must("#position-input"),
      statusMessage: must("#status-message"),
      modeTitle: must("#mode-title"),
      modeDescription: must("#mode-description"),
      paletteGrid: must("#palette-grid"),
      boardSizeField: must("#board-size-field"),
      paletteSection: must("#palette-section"),
      setupActions: must("#setup-actions"),
      playControls: must("#play-controls"),
      turnSummary: must("#turn-summary"),
      rollDetail: must("#roll-detail"),
      rollTotalValue: must("#roll-total-value"),
      remainingPointsValue: must("#remaining-points-value"),
      redScoreValue: must("#red-score"),
      blueScoreValue: must("#blue-score"),
      modeButtons: Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-mode]"),
      ),
      clearSelectionButton: must("#clear-selection"),
      clearBoardButton: must("#clear-board"),
      startGameButton: must("#start-game"),
      loadPositionButton: must("#load-position"),
      copyPositionButton: must("#copy-position"),
      rollGeneralButton: must("#roll-general"),
      rollSelectedButton: must("#roll-selected"),
      endTurnButton: must("#end-turn"),
      viewRulesButton: must("#view-rules"),
      rulesModal: must("#rules-modal"),
      closeRulesButton: must("#close-rules"),
    };
  }

  function setStatus(message: string): void {
    elements.statusMessage.textContent = message;
  }

  function makePiece(team: Team, kind: PieceKind): Piece {
    pieceIdCounter += 1;
    return { id: `${team}-${kind}-${pieceIdCounter}`, team, kind };
  }

  function findPieceAt(position: Position): PiecePlacement | undefined {
    for (const placement of pieces.values()) {
      if (placement.x === position.x && placement.y === position.y) {
        return placement;
      }
    }
    return undefined;
  }

  function hasRemainingUnits(team: ActiveTeam): boolean {
    for (const placement of pieces.values()) {
      if (placement.piece.team === team && placement.piece.kind !== "wall") {
        return true;
      }
    }
    return false;
  }

  function updateScoreUi(): void {
    elements.redScoreValue.textContent = String(scores.red);
    elements.blueScoreValue.textContent = String(scores.blue);
  }

  function resetScores(): void {
    scores.red = 0;
    scores.blue = 0;
    updateScoreUi();
  }

  function updateTurnUi(): void {
    elements.playControls.classList.toggle(
      "turn-red",
      turnState.activeTeam === "red",
    );
    elements.playControls.classList.toggle(
      "turn-blue",
      turnState.activeTeam === "blue",
    );

    if (turnState.phase === "game_over" && turnState.winner) {
      elements.turnSummary.textContent = `${turnState.winner.toUpperCase()} wins.`;
      elements.rollDetail.textContent = "The opposing leader was captured.";
      elements.rollTotalValue.textContent = String(turnState.total || "-");
      elements.remainingPointsValue.textContent = "0";
    } else if (turnState.phase === "await_roll") {
      elements.turnSummary.textContent = `${turnState.activeTeam.toUpperCase()} to roll.`;
      elements.rollDetail.textContent =
        "Choose a general roll or select one of your pieces and use its single roll for this turn.";
      elements.rollTotalValue.textContent = "-";
      elements.remainingPointsValue.textContent = "-";
    } else {
      const source =
        turnState.scope === "general"
          ? "General roll"
          : `${turnState.rolledPieceKind ?? "piece"} roll`;
      elements.turnSummary.textContent = `${turnState.activeTeam.toUpperCase()} resolving turn.`;
      elements.rollDetail.textContent = `${source}: [${turnState.dice.join(", ")}]`;
      elements.rollTotalValue.textContent = String(turnState.total);
      elements.remainingPointsValue.textContent = String(turnState.remaining);
    }

    const selectedPiece =
      selectedPieceId !== null ? pieces.get(selectedPieceId) : undefined;
    const canRollSelected =
      mode === "play" &&
      turnState.phase === "await_roll" &&
      !!selectedPiece &&
      selectedPiece.piece.team === turnState.activeTeam &&
      canPieceUseOwnRoll(selectedPiece.piece.kind);

    elements.rollGeneralButton.disabled =
      mode !== "play" || turnState.phase !== "await_roll";
    elements.rollSelectedButton.disabled = !canRollSelected;
    elements.endTurnButton.disabled =
      mode !== "play" || turnState.phase !== "resolve";
  }

  function drawOverlay(): void {
    renderer.drawOverlay(hoveredCell, selectedPieceId, pieces);
  }

  function resetTurnResolution(): void {
    turnState.scope = null;
    turnState.rolledPieceId = null;
    turnState.rolledPieceKind = null;
    turnState.dice = [];
    turnState.total = 0;
    turnState.remaining = 0;
    turnState.spent = false;
  }

  function preparePlaySession(resetScore = false): void {
    turnState.activeTeam = turn;
    turnState.phase = "await_roll";
    turnState.winner = null;
    resetTurnResolution();
    if (resetScore) {
      resetScores();
    }
    selectedPieceId = null;
    drawOverlay();
    updateTurnUi();
  }

  function beginNextTurn(): void {
    resetTurnResolution();
    turnState.activeTeam = turnState.activeTeam === "red" ? "blue" : "red";
    turnState.phase = "await_roll";
    turn = turnState.activeTeam;
    selectedPieceId = null;
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    drawOverlay();
    updateTurnUi();
    setStatus(`${turnState.activeTeam} to act.`);
  }

  function setGameOver(winner: ActiveTeam): void {
    turnState.phase = "game_over";
    turnState.winner = winner;
    updateTurnUi();
    setStatus(`${winner} wins by capturing the leader.`);
  }

  function startRoll(scope: "general" | "piece", piece?: PiecePlacement): void {
    if (mode !== "play" || turnState.phase !== "await_roll") {
      return;
    }

    const diceCount =
      scope === "general"
        ? 1
        : getDiceCountForPiece(piece?.piece.kind ?? "soldier");
    const dice = rollDice(diceCount);
    const total = dice.reduce((sum, value) => sum + value, 0);

    turnState.scope = scope;
    turnState.rolledPieceId =
      scope === "piece" ? (piece?.piece.id ?? null) : null;
    turnState.rolledPieceKind =
      scope === "piece" ? (piece?.piece.kind ?? null) : null;
    turnState.dice = dice;
    turnState.total = total;
    turnState.remaining = total;
    turnState.phase = "resolve";
    turnState.spent = false;

    updateTurnUi();
    setStatus(
      scope === "general"
        ? `${turnState.activeTeam} rolled ${total} for a general turn.`
        : `${piece?.piece.team} ${piece?.piece.kind} rolled ${total}.`,
    );
  }

  function clearBoard(): void {
    pieces.clear();
    renderer.clearPieces();
    selectedPieceId = null;
    drawOverlay();
  }

  function addPiece(
    team: Team,
    kind: PieceKind,
    position: Position,
  ): PiecePlacement {
    const placement: PiecePlacement = {
      piece: makePiece(team, kind),
      x: position.x,
      y: position.y,
      wallHits: kind === "wall" ? 0 : undefined,
    };
    pieces.set(placement.piece.id, placement);
    renderer.upsertPiece(placement);
    return placement;
  }

  function removePiece(pieceId: string): void {
    renderer.removePiece(pieceId);
    pieces.delete(pieceId);
  }

  function finishAction(): void {
    turnState.spent = true;
    if (turnState.remaining < 0) {
      turnState.remaining = 0;
    }
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    updateTurnUi();
    drawOverlay();
  }

  function damageWall(wall: PiecePlacement): void {
    wall.wallHits = 1;
    renderer.upsertPiece(wall);
  }

  function awardCapture(
    attackerTeam: ActiveTeam,
    defender: PiecePlacement,
  ): void {
    scores[attackerTeam] += PIECE_SCORES[defender.piece.kind];
    updateScoreUi();
  }

  function tryMovePiece(placement: PiecePlacement, target: Position): void {
    if (turnState.phase !== "resolve") {
      setStatus("Roll first.");
      return;
    }
    if (!canUsePieceForCurrentRoll(placement, turnState)) {
      setStatus("That piece cannot use the current roll.");
      return;
    }
    if (findPieceAt(target)) {
      setStatus("Regular movement must end on an empty square.");
      return;
    }

    const distance = getManhattanDistance(placement, target);
    if (distance < 1) {
      return;
    }
    if (distance > turnState.remaining) {
      setStatus(
        `That move needs ${distance} points but only ${turnState.remaining} remain.`,
      );
      return;
    }

    const path = getBlockingPiece(
      buildMovePath(placement, target),
      placement.piece.id,
      findPieceAt,
    );
    if (path) {
      setStatus(
        `Move blocked by ${path.piece.team} ${path.piece.kind} at (${path.x + 1}, ${path.y + 1}).`,
      );
      return;
    }

    renderer.animateMove(placement, target, () => {
      placement.x = target.x;
      placement.y = target.y;
      renderer.syncPieceView(placement);
      turnState.remaining -= distance;
      selectedPieceId = placement.piece.id;
      finishAction();
      setStatus(
        `${placement.piece.team} ${placement.piece.kind} moved ${distance} square${distance === 1 ? "" : "s"}.`,
      );
    });
  }

  function buildMovePath(from: Position, to: Position): Position[] {
    return getStraightLineSquares(from, { x: to.x, y: from.y }).concat(
      from.y === to.y ? [] : getStraightLineSquares({ x: to.x, y: from.y }, to),
    );
  }

  function tryAttack(attacker: PiecePlacement, defender: PiecePlacement): void {
    if (turnState.phase !== "resolve") {
      setStatus("Roll first.");
      return;
    }
    if (!canUsePieceForCurrentRoll(attacker, turnState)) {
      setStatus("That piece cannot use the current roll.");
      return;
    }
    if (!canPieceAttack(attacker.piece.kind)) {
      setStatus(`${PIECE_LABELS[attacker.piece.kind]} cannot attack directly.`);
      return;
    }
    if (defender.piece.team === attacker.piece.team) {
      setStatus("You cannot attack your own piece.");
      return;
    }

    const flexible = isFlexibleAttack(attacker.piece.kind);
    if (!flexible && turnState.spent) {
      setStatus("Attacks must use the roll before any movement is spent.");
      return;
    }
    if (!isStraightLine(attacker, defender)) {
      setStatus("Attacks must be in a straight vertical or horizontal line.");
      return;
    }

    const line = getStraightLineSquares(attacker, defender);
    const distance = line.length;

    if (flexible) {
      if (
        turnState.scope !== "piece" ||
        turnState.rolledPieceId !== attacker.piece.id
      ) {
        setStatus(
          `${PIECE_LABELS[attacker.piece.kind]} attacks require that piece's own roll.`,
        );
        return;
      }
      if (distance > turnState.remaining) {
        setStatus(
          `${PIECE_LABELS[attacker.piece.kind]} attack needs ${distance} points but only ${turnState.remaining} remain.`,
        );
        return;
      }
    } else if (distance !== turnState.total) {
      setStatus(
        `Attack distance must match the full roll total of ${turnState.total}.`,
      );
      return;
    }

    const blocker = getBlockingPiece(line, attacker.piece.id, findPieceAt);
    if (blocker && blocker.piece.id !== defender.piece.id) {
      setStatus(
        `Attack line blocked by ${blocker.piece.team} ${blocker.piece.kind} at (${blocker.x + 1}, ${blocker.y + 1}).`,
      );
      return;
    }

    const attackerTeam = assertActiveTeam(attacker.piece.team);
    const isWall = defender.piece.kind === "wall";
    const moveOnCapture = requiresMoveOnCapture(attacker.piece.kind);

    const spendAttackPoints = (): void => {
      turnState.remaining = flexible ? turnState.remaining - distance : 0;
      selectedPieceId = attacker.piece.id;
      finishAction();
    };

    const resolveWallHit = (): void => {
      if ((defender.wallHits ?? 0) < 1) {
        damageWall(defender);
        spendAttackPoints();
        setStatus(getWallMessage(attacker, true, turnState.remaining));
        return;
      }

      removePiece(defender.piece.id);
      spendAttackPoints();
      setStatus(getWallMessage(attacker, false, turnState.remaining));
    };

    const resolveCapture = (): void => {
      if (isWall) {
        resolveWallHit();
        return;
      }
      awardCapture(attackerTeam, defender);
      removePiece(defender.piece.id);
      spendAttackPoints();
      if (defender.piece.kind === "leader") {
        setGameOver(attackerTeam);
      } else {
        const enemyTeam: ActiveTeam = attackerTeam === "red" ? "blue" : "red";
        if (!hasRemainingUnits(enemyTeam)) {
          setGameOver(attackerTeam);
          return;
        }
        setStatus(getCaptureMessage(attacker, defender, turnState.remaining));
      }
    };

    if (moveOnCapture && (!isWall || (defender.wallHits ?? 0) > 0)) {
      const target = { x: defender.x, y: defender.y };
      renderer.animateMove(attacker, target, () => {
        attacker.x = target.x;
        attacker.y = target.y;
        renderer.syncPieceView(attacker);
        resolveCapture();
      });
      return;
    }

    resolveCapture();
  }

  function placeOrErasePiece(target: Position): void {
    const existing = findPieceAt(target);

    if (!selectedPalette) {
      if (existing) {
        removePiece(existing.piece.id);
        elements.positionInput.value = serializeState(
          boardSize,
          turn,
          pieces.values(),
        );
        drawOverlay();
        setStatus(`Removed piece at (${target.x + 1}, ${target.y + 1}).`);
      }
      return;
    }

    if (existing) {
      removePiece(existing.piece.id);
    }

    const created = addPiece(
      selectedPalette.team,
      selectedPalette.kind,
      target,
    );
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    drawOverlay();
    setStatus(
      `Placed ${created.piece.team === "neutral" ? created.piece.kind : `${created.piece.team} ${created.piece.kind}`} at (${target.x + 1}, ${target.y + 1}).`,
    );
  }

  function onBoardClick(position: Position): void {
    if (mode === "setup") {
      placeOrErasePiece(position);
      return;
    }
    if (turnState.phase === "game_over") {
      setStatus("The game is over. Return to setup to load a new position.");
      return;
    }

    const piece = findPieceAt(position);
    if (!selectedPieceId) {
      if (piece) {
        if (piece.piece.team !== turnState.activeTeam) {
          setStatus(`It is ${turnState.activeTeam}'s turn.`);
          return;
        }
        if (
          turnState.scope === "piece" &&
          turnState.rolledPieceId !== piece.piece.id
        ) {
          setStatus("This turn's roll belongs to a different piece.");
          return;
        }
        selectedPieceId = piece.piece.id;
        drawOverlay();
        updateTurnUi();
        setStatus(`Selected ${piece.piece.team} ${piece.piece.kind}.`);
      } else {
        setStatus("Select a piece first.");
      }
      return;
    }

    if (piece && piece.piece.id === selectedPieceId) {
      selectedPieceId = null;
      drawOverlay();
      updateTurnUi();
      setStatus("Selection cleared.");
      return;
    }

    const selectedPiece = pieces.get(selectedPieceId);
    if (!selectedPiece) {
      selectedPieceId = null;
      drawOverlay();
      updateTurnUi();
      return;
    }

    if (piece) {
      if (piece.piece.team === turnState.activeTeam) {
        if (
          turnState.scope === "piece" &&
          turnState.rolledPieceId !== piece.piece.id
        ) {
          setStatus("This turn's roll belongs to a different piece.");
          return;
        }
        selectedPieceId = piece.piece.id;
        drawOverlay();
        updateTurnUi();
        setStatus(`Selected ${piece.piece.team} ${piece.piece.kind}.`);
        return;
      }
      tryAttack(selectedPiece, piece);
      return;
    }

    tryMovePiece(selectedPiece, position);
  }

  function toggleModeSection(element: HTMLElement, isVisible: boolean): void {
    element.hidden = !isVisible;
    element.classList.toggle("is-hidden", !isVisible);
    element.setAttribute("aria-hidden", String(!isVisible));

    for (const control of element.querySelectorAll<
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >("button, input, select, textarea")) {
      control.disabled = !isVisible;
    }
  }

  function refreshModeUi(): void {
    const isSetup = mode === "setup";

    for (const button of elements.modeButtons) {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    }

    elements.modeTitle.textContent = isSetup ? "Setup mode" : "Play mode";
    elements.modeDescription.textContent = isSetup
      ? "Click squares to place or erase pieces. Drag to pan. Use the wheel to zoom."
      : "Roll first, then spend movement points or make a direct line-of-sight attack.";

    toggleModeSection(elements.boardSizeField, isSetup);
    toggleModeSection(elements.paletteSection, isSetup);
    toggleModeSection(elements.setupActions, isSetup);
    toggleModeSection(elements.loadPositionButton, isSetup);
    toggleModeSection(elements.playControls, !isSetup);
    elements.positionInput.readOnly = !isSetup;
    elements.positionInput.classList.toggle("is-readonly", !isSetup);
    updateTurnUi();
  }

  function renderPaletteColumn(
    columnClass: string,
    options: PaletteOption[],
    formatter?: (option: PaletteOption) => string,
  ): HTMLDivElement {
    const column = document.createElement("div");
    column.className = `palette-column ${columnClass}`;

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-button";
      button.dataset.team = option.team;
      button.dataset.kind = option.kind;
      button.innerHTML = `
        <span class="swatch swatch-${option.team}"></span>
        <span>${formatter ? formatter(option) : `${PIECE_LABELS[option.kind]}`}</span>
      `;
      button.classList.toggle(
        "is-active",
        selectedPalette?.team === option.team &&
          selectedPalette.kind === option.kind,
      );
      button.addEventListener("click", () => {
        selectedPalette = option;
        renderPalette();
        setStatus(`Palette selected: ${option.team} ${option.kind}.`);
      });
      column.appendChild(button);
    }

    return column;
  }

  function renderPalette(): void {
    elements.paletteGrid.replaceChildren(
      renderPaletteColumn("palette-column-red", RED_PALETTE),
      renderPaletteColumn(
        "palette-column-neutral",
        [WALL_PALETTE],
        () => PIECE_LABELS.wall,
      ),
      renderPaletteColumn("palette-column-blue", BLUE_PALETTE),
    );
    elements.clearSelectionButton.classList.toggle(
      "is-active",
      selectedPalette === null,
    );
  }

  function applySerializedState(
    nextState: ReturnType<typeof parseState>,
  ): void {
    clearBoard();
    boardSize = nextState.size;
    turn = nextState.turn;
    elements.boardSizeInput.value = String(boardSize);
    renderer.setBoardSize(boardSize);
    preparePlaySession(true);

    for (const placement of nextState.placements) {
      pieces.set(placement.piece.id, placement);
      renderer.upsertPiece(placement);
    }

    renderer.drawBoard();
    drawOverlay();
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    renderer.fitCameraToBoard();
    updateTurnUi();
  }

  function resizeBoard(nextSize: number): void {
    const safeSize = clampBoardSize(nextSize);
    boardSize = safeSize;
    renderer.setBoardSize(safeSize);

    for (const placement of [...pieces.values()]) {
      if (placement.x >= safeSize || placement.y >= safeSize) {
        removePiece(placement.piece.id);
      }
    }

    renderer.drawBoard();
    drawOverlay();
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    renderer.fitCameraToBoard();
    setStatus(`Board resized to ${safeSize}x${safeSize}.`);
  }

  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => {
      mode = button.dataset.mode === "play" ? "play" : "setup";
      selectedPieceId = null;
      if (mode === "play") {
        preparePlaySession(true);
      }
      refreshModeUi();
      drawOverlay();
      setStatus(mode === "setup" ? "Setup mode active." : "Play mode active.");
    });
  }

  elements.clearSelectionButton.addEventListener("click", () => {
    selectedPalette = null;
    renderPalette();
    setStatus("Eraser selected.");
  });

  elements.clearBoardButton.addEventListener("click", () => {
    clearBoard();
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    setStatus("Board cleared.");
  });

  elements.startGameButton.addEventListener("click", () => {
    mode = "play";
    preparePlaySession(true);
    refreshModeUi();
    elements.positionInput.value = serializeState(
      boardSize,
      turn,
      pieces.values(),
    );
    setStatus("Game started from current setup.");
  });

  elements.boardSizeInput.addEventListener("change", () => {
    resizeBoard(Number(elements.boardSizeInput.value));
  });

  elements.rollGeneralButton.addEventListener("click", () => {
    startRoll("general");
  });

  elements.rollSelectedButton.addEventListener("click", () => {
    if (!selectedPieceId) {
      setStatus("Select one of your pieces first.");
      return;
    }

    const piece = pieces.get(selectedPieceId);
    if (!piece) {
      setStatus("Selected piece was not found.");
      return;
    }

    if (piece.piece.team !== turnState.activeTeam) {
      setStatus(`It is ${turnState.activeTeam}'s turn.`);
      return;
    }

    if (!canPieceUseOwnRoll(piece.piece.kind)) {
      setStatus("Leader uses the general roll only.");
      return;
    }

    startRoll("piece", piece);
  });

  elements.endTurnButton.addEventListener("click", () => {
    if (turnState.phase === "resolve") {
      beginNextTurn();
    }
  });

  elements.loadPositionButton.addEventListener("click", () => {
    try {
      const parsed = parseState(elements.positionInput.value, makePiece);
      applySerializedState(parsed);
      mode = "play";
      refreshModeUi();
      setStatus("Position loaded and play mode enabled.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to load position.",
      );
    }
  });

  elements.copyPositionButton.addEventListener("click", async () => {
    const value = serializeState(boardSize, turn, pieces.values());
    elements.positionInput.value = value;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Position string copied.");
    } catch {
      setStatus("Position string refreshed. Clipboard copy was unavailable.");
    }
  });

  elements.viewRulesButton.addEventListener("click", () => {
    elements.rulesModal.showModal();
  });

  elements.closeRulesButton.addEventListener("click", () => {
    elements.rulesModal.close();
  });

  elements.rulesModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLDialogElement) {
      elements.rulesModal.close();
    }
  });

  renderer.drawBoard();
  renderer.resize();
  renderer.fitCameraToBoard();
  renderPalette();
  updateScoreUi();
  refreshModeUi();
  elements.positionInput.value = serializeState(
    boardSize,
    turn,
    pieces.values(),
  );
  setStatus(
    "Setup mode active. Choose a palette piece and click the board to place it.",
  );

  window.addEventListener("resize", () => {
    renderer.resize();
    renderer.fitCameraToBoard();
  });
}
