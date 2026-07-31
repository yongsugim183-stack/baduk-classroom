/* 자유 연습판 탭 */
const PracticeTab = (() => {
  let size = 19;
  let grid = null;
  let koPoint = null;
  let color = "black";
  let boardView = null;
  let history = [];
  let passCount = 0;

  function init() {
    render();
  }

  function reset(newSize) {
    size = newSize || size;
    grid = makeEmptyGrid(size);
    koPoint = null;
    color = "black";
    history = [];
    passCount = 0;
    renderBoard(true);
  }

  function render() {
    const area = document.getElementById("practice-content");
    area.innerHTML = `
      <h2>✏️ 자유 연습판</h2>
      <p class="hint-text">배운 규칙(활로, 따내기, 패, 자충)을 직접 실험해보는 공간입니다. 실제 규칙 엔진이 적용됩니다.</p>
      <div class="control-row">
        <label>판 크기:
          <select id="practice-size">
            <option value="9">9路</option>
            <option value="13">13路</option>
            <option value="19" selected>19路</option>
          </select>
        </label>
        <button class="secondary" id="practice-reset">초기화</button>
        <button class="secondary" id="practice-pass">패스</button>
        <button class="primary" id="practice-score">계가하기</button>
      </div>
      <div class="demo-wrap">
        <div class="board-holder" id="practice-board-holder"></div>
        <div id="practice-side" style="min-width:220px;">
          <div id="practice-turn"></div>
          <div id="practice-score-panel"></div>
        </div>
      </div>
    `;
    document.getElementById("practice-size").addEventListener("change", (e) => reset(parseInt(e.target.value, 10)));
    document.getElementById("practice-reset").addEventListener("click", () => reset());
    document.getElementById("practice-pass").addEventListener("click", () => {
      passCount++;
      color = color === "black" ? "white" : "black";
      updateSide();
      if (passCount >= 2) doScore();
    });
    document.getElementById("practice-score").addEventListener("click", doScore);
    grid = makeEmptyGrid(size);
    renderBoard(true);
  }

  function renderBoard(rebuild) {
    const holder = document.getElementById("practice-board-holder");
    if (rebuild || !boardView) {
      const cell = size >= 19 ? 30 : size >= 13 ? 36 : 44;
      boardView = new GoBoardView(holder, { size, cell, showCoords: true, onPointClick: handleClick });
    }
    boardView.setGrid(grid);
    updateSide();
  }

  async function handleClick(x, y) {
    const res = await fetch("/api/board/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, grid, color, x, y, ko_point: koPoint }),
    }).then((r) => r.json());
    if (!res.legal) {
      alert("둘 수 없는 자리입니다: " + res.error);
      return;
    }
    history.push({ grid: grid.map((r) => r.slice()), koPoint, color });
    grid = res.grid;
    koPoint = res.ko_point;
    passCount = 0;
    boardView.setGrid(grid);
    boardView.setLastMove([x, y]);
    color = color === "black" ? "white" : "black";
    updateSide();
  }

  function updateSide() {
    const el = document.getElementById("practice-turn");
    if (el) el.innerHTML = `<strong>다음 차례: ${color === "black" ? "⚫ 흑" : "⚪ 백"}</strong>`;
  }

  async function doScore() {
    const res = await fetch("/api/board/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, grid, komi: 6.5 }),
    }).then((r) => r.json());
    const panel = document.getElementById("practice-score-panel");
    panel.innerHTML = `
      <div class="score-panel">
        <div>⚫ 흑: 돌 ${res.black_stones} + 집 ${res.black_territory} = <strong>${res.black_total}</strong></div>
        <div>⚪ 백: 돌 ${res.white_stones} + 집 ${res.white_territory} + 덤 6.5 = <strong>${res.white_total}</strong></div>
        <div style="margin-top:6px;">🏆 ${res.winner === "black" ? "흑" : "백"} ${res.diff}집 승 (단순 지역제 계산, 완전히 둘러싸이지 않은 경계는 집으로 잡히지 않습니다)</div>
      </div>
    `;
  }

  return { init };
})();
