/* 앱 진입점: 탭 전환 및 초기화 */
document.addEventListener("DOMContentLoaded", () => {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  const initialized = { lessons: false, tsumego: false, rank: false, kifu: false, practice: false };

  async function activate(tabName) {
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    panels.forEach((p) => p.classList.toggle("active", p.id === `tab-${tabName}`));

    if (!initialized[tabName]) {
      initialized[tabName] = true;
      if (tabName === "lessons") await LessonsTab.init();
      if (tabName === "tsumego") await TsumegoTab.init();
      if (tabName === "rank") await RankTab.init();
      if (tabName === "kifu") await KifuTab.init();
      if (tabName === "practice") await PracticeTab.init();
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  activate("lessons");
});
