import {
  DEFAULT_BOARD_SIZE,
  MAX_BOARD_SIZE,
  MIN_BOARD_SIZE,
} from "./constants";

export function getAppTemplate(): string {
  return `
    <div class="shell">
      <section class="sidebar">
        <div class="panel">
          <p class="eyebrow">Battleboard</p>
          <h1>Board Editor And Arena</h1>
          <p class="lede">
            Build a position, export or paste a position string, then switch to play mode and move pieces by clicking a source square and destination square.
          </p>
        </div>

        <div class="panel controls">
          <div class="mode-switch">
            <button type="button" data-mode="setup" class="mode-button is-active">Setup</button>
            <button type="button" data-mode="play" class="mode-button">Play</button>
          </div>

          <label id="board-size-field" class="field">
            <span>Board size</span>
            <input id="board-size" type="number" min="${MIN_BOARD_SIZE}" max="${MAX_BOARD_SIZE}" value="${DEFAULT_BOARD_SIZE}" />
          </label>

          <div id="palette-section" class="palette">
            <div class="palette-header">
              <span>Placement palette</span>
              <button type="button" id="clear-selection" class="mini-button">Eraser</button>
            </div>
            <div id="palette-grid" class="palette-grid"></div>
          </div>

          <div id="setup-actions" class="actions">
            <button type="button" id="clear-board" class="secondary-button">Clear board</button>
            <button type="button" id="start-game" class="primary-button">Start game</button>
          </div>

          <div id="play-controls" class="play-controls" hidden>
            <p class="status-label">Turn tools</p>
            <p id="turn-summary" class="status-message"></p>
            <div class="roll-panel">
              <div class="roll-card">
                <span>Roll result</span>
                <strong id="roll-total-value">-</strong>
                <p id="roll-detail" class="hint">Choose a roll to begin this turn.</p>
              </div>
              <div class="roll-card roll-card-emphasis">
                <span>Remaining points</span>
                <strong id="remaining-points-value">-</strong>
                <p class="hint">Movement spends points. Flexible heavy attacks spend only distance.</p>
              </div>
            </div>
            <div class="score-strip">
              <div class="score-card">
                <span>Red score</span>
                <strong id="red-score">0</strong>
              </div>
              <div class="score-card">
                <span>Blue score</span>
                <strong id="blue-score">0</strong>
              </div>
            </div>
            <div class="actions">
              <button type="button" id="roll-general" class="secondary-button">General roll</button>
              <button type="button" id="roll-selected" class="secondary-button">Roll selected piece</button>
            </div>
            <div class="actions">
              <button type="button" id="end-turn" class="secondary-button">End turn</button>
              <button type="button" id="view-rules" class="secondary-button">View rules</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <label class="field">
            <span>Position string</span>
            <textarea id="position-input" rows="7" spellcheck="false"></textarea>
          </label>
          <div class="actions">
            <button type="button" id="load-position" class="secondary-button">Load string</button>
            <button type="button" id="copy-position" class="secondary-button">Copy current</button>
          </div>
          <p class="hint">
            Format: <code>bb1;size=100;turn=red;rows=...</code>. Rows are separated by <code>/</code>, digits compress empty squares, lowercase is red, uppercase is blue, <code>x</code> is an intact wall, and <code>X</code> is a cracked wall.
          </p>
        </div>

        <div class="panel">
          <p class="status-label">Status</p>
          <p id="status-message" class="status-message"></p>
        </div>
      </section>

      <section class="board-panel">
        <div class="board-toolbar">
          <div>
            <strong id="mode-title">Setup mode</strong>
            <p id="mode-description">Click squares to place or erase pieces. Drag to pan. Use the wheel to zoom.</p>
          </div>
        </div>
        <div id="board-host" class="board-host"></div>
      </section>
    </div>

    <dialog id="rules-modal" class="rules-modal">
      <div class="rules-content">
        <div class="rules-header">
          <div>
            <p class="eyebrow">Rules</p>
            <h2>Battleboard Turn Guide</h2>
          </div>
          <button type="button" id="close-rules" class="mini-button">Close</button>
        </div>
        <div class="rules-copy">
          <p>Red and blue alternate turns. Each turn allows exactly one roll: either a general roll or a selected-piece roll.</p>
          <p><strong>Dice:</strong> all piece-specific rolls use 1d6. Leader movement is only available through the general roll.</p>
          <p><strong>General roll:</strong> the rolled total can be split across movement by multiple friendly pieces. It can also be used for one attack by a soldier or archer.</p>
          <p><strong>Piece roll:</strong> the rolled total belongs only to the selected piece. Soldiers and archers may use it to attack. Champions and behemoths may mix movement and direct line-of-sight attacks in any order while points remain.</p>
          <p><strong>Movement:</strong> pieces move orthogonally using the displayed path. They cannot pass through occupied squares, and non-attacking moves must end on an empty square.</p>
          <p><strong>Attacks:</strong> soldiers and archers attack directly using the full roll total. The target must be exactly that many squares away in a straight horizontal or vertical line with no piece in between. Archers attack at range and stay put. Soldiers move onto the target square to capture. Champions and behemoths attack only on their own piece roll, also in straight unobstructed line of sight, but they spend only the distance used and may keep moving or attack again if points remain. Champions capture by moving onto the target square. Behemoths capture from range and stay put.</p>
          <p><strong>Walls:</strong> walls are neutral blockers. They require two direct hits to remove. The first hit cracks the wall and leaves it standing. The second hit removes it. Champions must step onto the wall square only when the second hit destroys it. Behemoths, archers, and soldiers can damage walls from their normal attack pattern.</p>
          <p><strong>Leader:</strong> leaders cannot attack directly. Capturing a leader ends the game immediately.</p>
          <p><strong>Scoring:</strong> soldier 1 point, archer 2, champion 8, behemoth 20, leader 50.</p>
        </div>
      </div>
    </dialog>
  `;
}
