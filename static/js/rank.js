/* 급수전(랭크 대국) 탭 */
const RankTab = (() => {
  let ranks = [];
  let stateInfo = null;
  let boardView = null;
  let gameId = null;
  let size = 9;
  let grid = null;
  let myTurn = true;
  let finished = false;
  let busy = false;

  async function init() {
    ranks = (await fetch("/api/rank/ranks").then((r) => r.json())).ranks;
    await refreshState();
    render();
  }

  async function refreshState() {
    stateInfo = await fetch("/api/rank/state").then((r) => r.json());
  }

  function render() {
    const area = document.getElementById("rank-content");
    area.innerHTML = `
      <h2>🏆 급수전</h2>
      <p class="hint-text">이기면 한 단계 승급합니다. 상대 AI는 급수에 맞춰 실력이 강해지는 연습용 상대이며, 공인 급단과는 관계없습니다.</p>
      <div class="score-panel">
        <strong>현재 급수: ${stateInfo.rank_label}</strong>
        <span class="hint-text"> (${stateInfo.wins}승 ${stateInfo.losses}패)</span>
        ${stateInfo.is_max ? '<div class="hint-text">🎉 최고 단계에 도달했습니다!</div>' : ""}
      </div>
      <div id="rank-ladder" class="rank-ladder"></div>
      <div id="rank-game-area"></div>
    `;
    renderLadder();
    renderStartPanel();
  }

  function renderLadder() {
    const el = document.getElementById("rank-ladder");
    el.innerHTML = ranks
      .map((r) => `<span class="rank-pill${r.index === stateInfo.rank_index ? " current" : ""}">${r.label}</span>`)
      .join("");
  }

  function renderStartPanel() {
    const area = document.getElementById("rank-game-area");
    const recommended = ranks[stateInfo.rank_index].recommended_size;
    area.innerHTML = `
      <div class="control-row">
        <label>판 크기:
          <select id="rank-size">
            <option value="9" ${recommended === 9 ? "selected" : ""}>9路 (입문 추천)</option>
            <option value="13" ${recommended === 13 ? "selected" : ""}>13路</option>
            <option value="19" ${recommended === 19 ? "selected" : ""}>19路</option>
          </select>
        </label>
        <button class="primary" id="rank-start-btn">⚫ 흑으로 대국 시작</button>
      </div>
      <p class="hint-text">사용자는 항상 흑으로 먼저 둡니다. 백(AI)에게는 덤 6.5집이 적용됩니다.</p>
    `;
    document.getElementById("rank-start-btn").addEventListener("click", startGame);
  }

  async function startGame() {
    size = parseInt(document.getElementById("rank-size").value, 10);
    const res = await fetch("/api/rank/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, komi: 6.5 }),
    }).then((r) => r.json());
    gameId = res.game_id;
    grid = res.grid;
    finished = false;
    myTurn = true;
    busy = false;

    const area = document.getElementById("rank-game-area");
    area.innerHTML = `
      <div class="demo-wrap">
        <div class="board-holder" id="rank-board-holder"></div>
        <div id="rank-side" style="min-width:240px;"></div>
      </div>
      <div class="control-row">
        <button class="secondary" id="rank-pass-btn">패스</button>
        <button class="secondary" id="rank-score-btn">지금 계가하기</button>
        <button class="secondary" id="rank-resign-btn">기권</button>
      </div>
      <div id="rank-result"></div>
    `;
    const cell = size >= 19 ? 30 : size >= 13 ? 36 : 44;
    const holder = document.getElementById("rank-board-holder");
    boardView = new GoBoardView(holder, { size, cell, showCoords: true, onPointClick: handleUserClick });
    boardView.setGrid(grid);
    updateSide(`상대 급수: ${res.rank_label} (난이도 ${res.strength})`);

    document.getElementById("rank-pass-btn").addEventListener("click", handlePass);
    document.getElementById("rank-score-btn").addEventListener("click", handleScoreNow);
    document.getElementById("rank-resign-btn").addEventListener("click", handleResign);
  }

  function updateSide(extra) {
    const el = document.getElementById("rank-side");
    if (!el) return;
    el.innerHTML = `
      <div><strong>${finished ? "대국 종료" : myTurn ? "⚫ 당신의 차례" : "⚪ 상대(AI) 생각 중..."}</strong></div>
      <div class="hint-text">${extra || ""}</div>
    `;
  }

  async function handleUserClick(x, y) {
    if (busy || finished || !myTurn) return;
    busy = true;
    myTurn = false;
    updateSide("두는 중...");
    const res = await fetch("/api/rank/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, x, y }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert("둘 수 없는 자리입니다: " + err.detail);
      myTurn = true;
      busy = false;
      updateSide();
      return;
    }
    const data = await res.json();
    grid = data.grid;
    boardView.setGrid(grid);
    if (data.bot_result && !data.bot_result.passed) {
      boardView.setLastMove([data.bot_result.x, data.bot_result.y]);
    } else {
      boardView.setLastMove([x, y]);
    }
    if (data.finished) {
      finishGame(data.score);
      return;
    }
    const botMsg = data.bot_result?.passed ? "상대가 패스했습니다." : "";
    myTurn = true;
    busy = false;
    updateSide(botMsg);
  }

  async function handlePass() {
    if (busy || finished) return;
    busy = true;
    myTurn = false;
    updateSide("패스했습니다. 상대 응수 대기 중...");
    const res = await fetch("/api/rank/game/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    }).then((r) => r.json());
    if (res.grid) {
      grid = res.grid;
      boardView.setGrid(grid);
    }
    if (res.finished) {
      finishGame(res.score);
      return;
    }
    myTurn = true;
    busy = false;
    updateSide(res.bot_result?.passed ? "상대도 패스했습니다." : "상대가 착수했습니다.");
  }

  async function handleScoreNow() {
    if (busy || finished) return;
    if (!confirm("지금 상태 그대로 계가하시겠습니까? (더 이상 서로 둘 곳이 없다고 가정합니다)")) return;
    busy = true;
    const res = await fetch("/api/rank/game/score_now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    }).then((r) => r.json());
    finishGame(res.score);
  }

  async function handleResign() {
    if (busy || finished) return;
    if (!confirm("기권하시겠습니까?")) return;
    busy = true;
    const res = await fetch("/api/rank/game/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    }).then((r) => r.json());
    finished = true;
    busy = false;
    await refreshState();
    render();
    const box = document.createElement("div");
    box.className = "feedback-box wrong";
    box.textContent = "기권했습니다. 다음 기회에 다시 도전해보세요!";
    document.getElementById("rank-game-area").prepend(box);
  }

  async function finishGame(score) {
    finished = true;
    busy = false;
    updateSide("대국 종료");
    await refreshState();
    render();
    const box = document.createElement("div");
    box.className = "feedback-box " + (score.user_won ? "correct" : "wrong");
    box.innerHTML = `
      <div><strong>${score.user_won ? "🎉 승리했습니다!" : "아쉽게 패배했습니다."}</strong></div>
      <div>⚫ 흑(나): ${score.black_total}집 · ⚪ 백(AI): ${score.white_total}집</div>
      ${score.promoted ? `<div>➡️ ${score.new_rank_label}(으)로 승급했습니다!</div>` : ""}
    `;
    const area = document.getElementById("rank-game-area");
    area.prepend(box);
  }

  return { init };
})();
