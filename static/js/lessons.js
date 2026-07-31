/* 학습 탭 */
const LessonsTab = (() => {
  let levels = [];
  let progress = {};
  let currentLessonId = null;

  async function init() {
    const data = await fetch("/api/lessons").then((r) => r.json());
    levels = data.levels;
    progress = await fetch("/api/lessons/progress").then((r) => r.json());
    renderNav();
    const first = levels[0]?.lessons[0];
    if (first) showLesson(first.id);
  }

  function renderNav() {
    const nav = document.getElementById("lesson-nav");
    nav.innerHTML = "";
    for (const level of levels) {
      const group = document.createElement("div");
      group.className = "level-group";
      const title = document.createElement("div");
      title.className = "level-title";
      title.textContent = `${level.name}`;
      group.appendChild(title);
      for (const lesson of level.lessons) {
        const a = document.createElement("div");
        a.className = "lesson-link" + (lesson.id === currentLessonId ? " active" : "");
        a.dataset.id = lesson.id;
        const done = progress[lesson.id];
        a.innerHTML = `<span>${lesson.title}</span><span class="badge-check">${done ? "✅" : ""}</span>`;
        a.addEventListener("click", () => showLesson(lesson.id));
        group.appendChild(a);
      }
      nav.appendChild(group);
    }
  }

  function findLesson(id) {
    for (const level of levels) {
      for (const lesson of level.lessons) {
        if (lesson.id === id) return { lesson, level };
      }
    }
    return null;
  }

  function flatLessonIds() {
    const ids = [];
    for (const level of levels) for (const lesson of level.lessons) ids.push(lesson.id);
    return ids;
  }

  function showLesson(id) {
    const found = findLesson(id);
    if (!found) return;
    currentLessonId = id;
    renderNav();
    const { lesson, level } = found;
    const area = document.getElementById("lesson-content");
    area.innerHTML = "";

    const tag = document.createElement("span");
    tag.className = "tag-pill";
    tag.textContent = level.name;

    const h2 = document.createElement("h2");
    h2.className = "lesson-title";
    h2.textContent = lesson.title;
    h2.appendChild(tag);
    area.appendChild(h2);

    const body = document.createElement("div");
    body.className = "lesson-body";
    for (const p of lesson.content) {
      const pel = document.createElement("p");
      pel.textContent = p;
      body.appendChild(pel);
    }
    area.appendChild(body);

    if (lesson.demo) {
      const wrap = document.createElement("div");
      wrap.className = "demo-wrap";
      const holder = document.createElement("div");
      holder.className = "board-holder";
      wrap.appendChild(holder);
      area.appendChild(wrap);

      const size = lesson.demo.size || 9;
      const cell = size >= 19 ? 26 : size >= 13 ? 32 : 40;
      const view = new GoBoardView(holder, { size, cell, showCoords: false });
      view.setGrid(gridFromStones(size, lesson.demo.black, lesson.demo.white));
      const marks = (lesson.demo.marks || []).map(([x, y, label]) => ({ x, y, label: label ? "★" : "", color: "#a9552f" }));
      view.setMarks(marks);
      if (lesson.demo.marks && lesson.demo.marks.length) {
        const legend = document.createElement("div");
        legend.innerHTML = lesson.demo.marks.map(([, , l]) => `<div>★ ${l}</div>`).join("");
        legend.style.fontSize = "0.9rem";
        legend.style.color = "var(--sub)";
        wrap.appendChild(legend);
      }
    }

    const navRow = document.createElement("div");
    navRow.className = "lesson-nav-buttons";
    const ids = flatLessonIds();
    const idx = ids.indexOf(id);

    const prevBtn = document.createElement("button");
    prevBtn.className = "secondary";
    prevBtn.textContent = "◀ 이전";
    prevBtn.disabled = idx <= 0;
    prevBtn.addEventListener("click", () => showLesson(ids[idx - 1]));

    const doneBtn = document.createElement("button");
    doneBtn.className = "primary";
    doneBtn.textContent = progress[id] ? "완료됨 ✓" : "학습 완료 표시";
    doneBtn.addEventListener("click", async () => {
      await fetch("/api/lessons/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: id, completed: true }),
      });
      progress[id] = true;
      showLesson(id);
    });

    const nextBtn = document.createElement("button");
    nextBtn.className = "secondary";
    nextBtn.textContent = "다음 ▶";
    nextBtn.disabled = idx >= ids.length - 1;
    nextBtn.addEventListener("click", () => showLesson(ids[idx + 1]));

    navRow.appendChild(prevBtn);
    navRow.appendChild(doneBtn);
    navRow.appendChild(nextBtn);
    area.appendChild(navRow);
  }

  return { init };
})();
