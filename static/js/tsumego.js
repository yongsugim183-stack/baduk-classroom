/* 사활 테스트 탭 */
const TsumegoTab = (() => {
  let puzzles = [];
  let progress = {};
  let currentId = null;
  let boardView = null;
  let answered = false;

  async function init() {
    const data = await fetch("/api/tsumego").then((r) => r.json());
    puzzles = data.puzzles;
    progress = await fetch("/api/tsumego/progress").then((r) => r.json());
    renderNav();
    if (puzzles.length) showPuzzle(puzzles[0].id);
  }

  function renderNav() {
    const nav = document.getElementById("tsumego-nav");
    nav.innerHTML = "";
    const byCategory = {};
    for (const p of puzzles) {
      (byCategory[p.category] = byCategory[p.category] || []).push(p);
    }
    for (const [cat, list] of Object.entries(byCategory)) {
      const group = document.createElement("div");
      group.className = "level-group";
      const title = document.createElement("div");
      title.className = "level-title";
      title.textContent = cat;
      group.appendChild(title);
      for (const p of list) {
        const a = document.createElement("div");
        a.className = "puzzle-link" + (p.id === currentId ? " active" : "");
        const solved = progress[p.id]?.solved;
        a.innerHTML = `<span>${p.title}</span><span class="badge-check">${solved ? "✅" : ""}</span>`;
        a.addEventListener("click", () => showPuzzle(p.id));
        group.appendChild(a);
      }
      nav.appendChild(group);
    }
  }

  function stars(n) {
    return "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));
  }

  function showPuzzle(id) {
    const puzzle = puzzles.find((p) => p.id === id);
    if (!puzzle) return;
    currentId = id;
    answered = false;
    renderNav();

    const area = document.getElementById("tsumego-content");
    area.innerHTML = "";

    const header = document.createElement("div");
    header.className = "puzzle-header";
    header.innerHTML = `<h2>${puzzle.title}</h2><span class="diff-stars">${stars(puzzle.difficulty)}</span>`;
    area.appendChild(header);

    const prompt = document.createElement("p");
    prompt.textContent = puzzle.prompt;
    area.appendChild(prompt);

    if (puzzle.type === "vital_point") {
      renderVitalPointPuzzle(area, puzzle);
    } else if (puzzle.type === "choice") {
      renderChoicePuzzle(area, puzzle);
    }

    const navRow = document.createElement("div");
    navRow.className = "lesson-nav-buttons";
    const idx = puzzles.findIndex((p) => p.id === id);
    const prevBtn = document.createElement("button");
    prevBtn.className = "secondary";
    prevBtn.textContent = "◀ 이전 문제";
    prevBtn.disabled = idx <= 0;
    prevBtn.addEventListener("click", () => showPuzzle(puzzles[idx - 1].id));
    const nextBtn = document.createElement("button");
    nextBtn.className = "secondary";
    nextBtn.textContent = "다음 문제 ▶";
    nextBtn.disabled = idx >= puzzles.length - 1;
    nextBtn.addEventListener("click", () => showPuzzle(puzzles[idx + 1].id));
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    area.appendChild(navRow);
  }

  function renderVitalPointPuzzle(area, puzzle) {
    const wrap = document.createElement("div");
    wrap.className = "demo-wrap";
    const holder = document.createElement("div");
    holder.className = "board-holder";
    wrap.appendChild(holder);

    const turnLabel = document.createElement("div");
    turnLabel.innerHTML = `<strong>${puzzle.to_move === "black" ? "⚫ 흑" : "⚪ 백"} 차례</strong>`;
    turnLabel.style.marginBottom = "8px";

    const feedback = document.createElement("div");

    const rightCol = document.createElement("div");
    rightCol.appendChild(turnLabel);
    rightCol.appendChild(feedback);
    wrap.appendChild(rightCol);

    area.appendChild(wrap);

    const size = puzzle.size;
    const cell = 44;
    boardView = new GoBoardView(holder, {
      size,
      cell,
      showCoords: false,
      onPointClick: (x, y) => {
        if (answered) return;
        handleVitalClick(puzzle, x, y, feedback);
      },
    });
    boardView.setGrid(gridFromStones(size, puzzle.black, puzzle.white));
  }

  function handleVitalClick(puzzle, x, y, feedbackEl) {
    const grid = gridFromStones(puzzle.size, puzzle.black, puzzle.white);
    if (grid[x][y] !== EMPTY) return; // 이미 돌이 있는 자리는 무시
    const isCorrect = puzzle.vital_points.some(([vx, vy]) => vx === x && vy === y);
    answered = true;
    const color = puzzle.to_move === "black" ? BLACK : WHITE;
    grid[x][y] = color;
    boardView.setGrid(grid);
    boardView.setLastMove([x, y]);
    boardView.setMarks(puzzle.vital_points.map(([vx, vy]) => ({ x: vx, y: vy, color: isCorrect ? "#2f7d4f" : "#c0392b" })));

    showFeedback(feedbackEl, isCorrect, isCorrect ? puzzle.success_message : puzzle.fail_hint, puzzle.explanation);
    recordAttempt(puzzle.id, isCorrect);
  }

  function renderChoicePuzzle(area, puzzle) {
    if (puzzle.size) {
      const wrap = document.createElement("div");
      wrap.className = "demo-wrap";
      const holder = document.createElement("div");
      holder.className = "board-holder";
      wrap.appendChild(holder);
      area.appendChild(wrap);
      const view = new GoBoardView(holder, { size: puzzle.size, cell: 40, showCoords: false });
      view.setGrid(gridFromStones(puzzle.size, puzzle.black, puzzle.white));
    }

    const list = document.createElement("div");
    list.className = "choice-list";
    const feedback = document.createElement("div");

    puzzle.choices.forEach((choice, i) => {
      const item = document.createElement("div");
      item.className = "choice-item";
      item.textContent = choice;
      item.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === puzzle.correct_index;
        item.classList.add(correct ? "correct" : "wrong");
        if (!correct) {
          list.children[puzzle.correct_index].classList.add("correct");
        }
        showFeedback(feedback, correct, correct ? "정답입니다!" : "아쉽지만 오답입니다.", puzzle.explanation);
        recordAttempt(puzzle.id, correct);
      });
      list.appendChild(item);
    });

    area.appendChild(list);
    area.appendChild(feedback);
  }

  function showFeedback(el, correct, message, explanation) {
    el.innerHTML = "";
    const box = document.createElement("div");
    box.className = "feedback-box " + (correct ? "correct" : "wrong");
    box.innerHTML = `<div>${message}</div><div class="hint-text">${explanation || ""}</div>`;
    el.appendChild(box);
  }

  async function recordAttempt(puzzleId, correct) {
    const res = await fetch("/api/tsumego/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzle_id: puzzleId, correct }),
    }).then((r) => r.json());
    progress[puzzleId] = { solved: res.solved, attempts: res.attempts };
    renderNav();
  }

  return { init };
})();
