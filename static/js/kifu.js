/* 복기(기보 재생/기록) 탭 */
const KifuTab = (() => {
  let boardView = null;
  let snapshots = []; // {grid, captured, move_no, color, x, y, comment}
  let moveList = []; // {color, x, y, comment}  (recording 모드에서 채워짐, 저장용)
  let currentIndex = 0;
  let mode = null; // 'view' | 'record'
  let size = 19;
  let currentColor = "black";
  let loadedId = null;
  let title = "";

  async function init() {
    renderShell();
    await refreshList();
  }

  function renderShell() {
    const area = document.getElementById("kifu-content");
    area.innerHTML = `
      <h2>📜 복기 (기보 재생 / 기록)</h2>
      <div class="control-row">
        <button class="secondary" id="kifu-mode-view">SGF 불러와서 복기</button>
        <button class="secondary" id="kifu-mode-record">새 대국 기록하기</button>
      </div>
      <div id="kifu-body"></div>
      <hr style="margin:24px 0; border-color: var(--border);">
      <h3>저장된 기보</h3>
      <div id="kifu-list"></div>
    `;
    document.getElementById("kifu-mode-view").addEventListener("click", startViewMode);
    document.getElementById("kifu-mode-record").addEventListener("click", startRecordMode);
  }

  function startViewMode() {
    mode = "view";
    loadedId = null;
    const body = document.getElementById("kifu-body");
    body.innerHTML = `
      <div class="control-row">
        <textarea id="sgf-input" placeholder="SGF 텍스트를 붙여넣으세요. 예) (;GM[1]SZ[19];B[pd];W[dp];...)"></textarea>
      </div>
      <div class="control-row">
        <button class="primary" id="sgf-parse-btn">불러오기</button>
      </div>
      <div id="kifu-player"></div>
    `;
    document.getElementById("sgf-parse-btn").addEventListener("click", async () => {
      const text = document.getElementById("sgf-input").value.trim();
      if (!text) return;
      const res = await fetch("/api/kifu/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sgf_text: text }),
      });
      if (!res.ok) {
        alert("SGF 파싱에 실패했습니다. 형식을 확인해주세요.");
        return;
      }
      const data = await res.json();
      snapshots = data.snapshots;
      size = data.meta.size;
      title = data.meta.event || "불러온 기보";
      currentIndex = 0;
      renderPlayer(true);
    });
  }

  function startRecordMode() {
    mode = "record";
    loadedId = null;
    snapshots = [{ grid: makeEmptyGrid(19), captured: [], move_no: 0, comment: "" }];
    moveList = [];
    currentIndex = 0;
    currentColor = "black";
    size = 19;

    const body = document.getElementById("kifu-body");
    body.innerHTML = `
      <div class="control-row">
        <label>판 크기:
          <select id="record-size">
            <option value="9">9路</option>
            <option value="13">13路</option>
            <option value="19" selected>19路</option>
          </select>
        </label>
        <label>제목: <input type="text" id="record-title" value="새 기보" /></label>
      </div>
      <div id="kifu-player"></div>
    `;
    document.getElementById("record-size").addEventListener("change", (e) => {
      size = parseInt(e.target.value, 10);
      snapshots = [{ grid: makeEmptyGrid(size), captured: [], move_no: 0, comment: "" }];
      moveList = [];
      currentIndex = 0;
      currentColor = "black";
      renderPlayer(true);
    });
    document.getElementById("record-title").addEventListener("input", (e) => {
      title = e.target.value;
    });
    title = "새 기보";
    renderPlayer(true);
  }

  function renderPlayer(rebuildBoard) {
    const container = document.getElementById("kifu-player");
    if (!container) return;
    if (rebuildBoard || !boardView) {
      container.innerHTML = `
        <div class="demo-wrap">
          <div class="board-holder" id="kifu-board-holder"></div>
          <div id="kifu-side" style="min-width:260px;"></div>
        </div>
        <div class="move-nav">
          <button id="mv-first">⏮ 처음</button>
          <button id="mv-prev">◀ 이전</button>
          <span id="mv-counter" style="align-self:center; padding:0 8px;"></span>
          <button id="mv-next">다음 ▶</button>
          <button id="mv-last">끝 ⏭</button>
        </div>
        <div class="comment-box">
          <label>이 수에 대한 코멘트:</label>
          <textarea id="mv-comment"></textarea>
        </div>
        <div class="control-row">
          <button class="primary" id="kifu-save-btn">💾 저장</button>
          <button class="secondary" id="kifu-download-btn">SGF 다운로드</button>
          <span id="kifu-score-info"></span>
        </div>
      `;
      const holder = document.getElementById("kifu-board-holder");
      const cell = size >= 19 ? 30 : size >= 13 ? 36 : 44;
      boardView = new GoBoardView(holder, {
        size,
        cell,
        showCoords: true,
        onPointClick: mode === "record" ? handleRecordClick : null,
      });
      document.getElementById("mv-first").addEventListener("click", () => goTo(0));
      document.getElementById("mv-prev").addEventListener("click", () => goTo(currentIndex - 1));
      document.getElementById("mv-next").addEventListener("click", () => goTo(currentIndex + 1));
      document.getElementById("mv-last").addEventListener("click", () => goTo(snapshots.length - 1));
      document.getElementById("mv-comment").addEventListener("change", (e) => {
        snapshots[currentIndex].comment = e.target.value;
        if (mode === "record" && currentIndex > 0) moveList[currentIndex - 1].comment = e.target.value;
      });
      document.getElementById("kifu-save-btn").addEventListener("click", saveKifu);
      document.getElementById("kifu-download-btn").addEventListener("click", downloadKifu);
    }
    updateBoardAt(currentIndex);
  }

  function handleRecordClick(x, y) {
    const grid = snapshots[currentIndex].grid;
    fetch("/api/board/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size,
        grid,
        color: currentColor,
        x,
        y,
        ko_point: snapshots[currentIndex].ko_point || null,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.legal) {
          alert("둘 수 없는 자리입니다: " + res.error);
          return;
        }
        // 현재 지점 이후 수순은 버리고 새 수를 추가 (편집 중 분기 방지, 단순화)
        snapshots = snapshots.slice(0, currentIndex + 1);
        moveList = moveList.slice(0, currentIndex);
        const newSnap = {
          grid: res.grid,
          captured: res.captured,
          move_no: currentIndex + 1,
          color: currentColor,
          x, y,
          comment: "",
          ko_point: res.ko_point,
        };
        snapshots.push(newSnap);
        moveList.push({ color: currentColor, x, y, comment: "" });
        currentColor = currentColor === "black" ? "white" : "black";
        currentIndex = snapshots.length - 1;
        updateBoardAt(currentIndex);
      });
  }

  function goTo(idx) {
    if (idx < 0 || idx >= snapshots.length) return;
    currentIndex = idx;
    updateBoardAt(idx);
  }

  function updateBoardAt(idx) {
    const snap = snapshots[idx];
    boardView.setGrid(snap.grid);
    boardView.setLastMove(snap.x !== undefined && snap.x !== null ? [snap.x, snap.y] : null);
    boardView.setMarks([]);
    const counter = document.getElementById("mv-counter");
    if (counter) counter.textContent = `${idx} / ${snapshots.length - 1} 수`;
    const commentEl = document.getElementById("mv-comment");
    if (commentEl) commentEl.value = snap.comment || "";

    const prevBtn = document.getElementById("mv-prev");
    const firstBtn = document.getElementById("mv-first");
    const nextBtn = document.getElementById("mv-next");
    const lastBtn = document.getElementById("mv-last");
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (firstBtn) firstBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === snapshots.length - 1;
    if (lastBtn) lastBtn.disabled = idx === snapshots.length - 1;

    const side = document.getElementById("kifu-side");
    if (side) {
      const nextColor = idx === snapshots.length - 1 ? (mode === "record" ? currentColor : null) : null;
      side.innerHTML = `
        <div><strong>제목:</strong> ${title || ""}</div>
        <div><strong>판 크기:</strong> ${size}路</div>
        ${snap.captured && snap.captured.length ? `<div style="color:var(--accent)">이 수로 ${snap.captured.length}점 따냄</div>` : ""}
        ${mode === "record" ? `<div style="margin-top:8px;">다음 착수: <strong>${currentColor === "black" ? "⚫ 흑" : "⚪ 백"}</strong></div>` : ""}
      `;
    }
  }

  async function saveKifu() {
    const moves = mode === "record" ? moveList : snapshots.slice(1).map((s) => ({ color: s.color, x: s.x, y: s.y, comment: s.comment || "" }));
    const t = mode === "record" ? (document.getElementById("record-title")?.value || "새 기보") : title;
    const res = await fetch("/api/kifu/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, size, moves, id: loadedId }),
    }).then((r) => r.json());
    loadedId = res.id;
    alert("저장되었습니다.");
    refreshList();
  }

  function downloadKifu() {
    const moves = mode === "record" ? moveList : snapshots.slice(1).map((s) => ({ color: s.color, x: s.x, y: s.y, comment: s.comment || "" }));
    fetch("/api/kifu/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "기보", size, moves, id: loadedId }),
    })
      .then((r) => r.json())
      .then((res) => {
        loadedId = res.id;
        const blob = new Blob([res.sgf_text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || "kifu"}.sgf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function refreshList() {
    const list = await fetch("/api/kifu/list").then((r) => r.json());
    const el = document.getElementById("kifu-list");
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<p class="hint-text">저장된 기보가 없습니다.</p>`;
      return;
    }
    el.innerHTML = "";
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "kifu-list-item";
      row.innerHTML = `
        <span>${item.title} <span class="hint-text">(${item.size}路 · ${item.created_at})</span></span>
        <span>
          <button class="secondary" data-act="load" data-id="${item.id}">불러오기</button>
          <button class="secondary" data-act="del" data-id="${item.id}">삭제</button>
        </span>
      `;
      el.appendChild(row);
    }
    el.querySelectorAll("button[data-act=load]").forEach((btn) => {
      btn.addEventListener("click", () => loadSavedKifu(btn.dataset.id));
    });
    el.querySelectorAll("button[data-act=del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 기보를 삭제할까요?")) return;
        await fetch(`/api/kifu/${btn.dataset.id}`, { method: "DELETE" });
        refreshList();
      });
    });
  }

  async function loadSavedKifu(id) {
    const row = await fetch(`/api/kifu/${id}`).then((r) => r.json());
    mode = "view";
    loadedId = row.id;
    const parsed = await fetch("/api/kifu/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sgf_text: row.sgf_text }),
    }).then((r) => r.json());
    snapshots = parsed.snapshots;
    size = parsed.meta.size;
    title = row.title;
    currentIndex = 0;
    const body = document.getElementById("kifu-body");
    body.innerHTML = `<div id="kifu-player"></div>`;
    renderPlayer(true);
  }

  return { init };
})();
