/* 바둑 뉴스/트렌드 탭 */
const NewsTab = (() => {
  async function init() {
    const area = document.getElementById("news-content");
    area.innerHTML = "";
    const h2 = document.createElement("h2");
    h2.textContent = "📰 바둑 뉴스 & 트렌드";
    const hint = document.createElement("p");
    hint.className = "hint-text";
    hint.textContent = "매주 자동으로 업데이트됩니다.";
    const list = document.createElement("div");
    list.id = "news-list";
    area.appendChild(h2);
    area.appendChild(hint);
    area.appendChild(list);

    const data = await fetch("/api/news").then((r) => r.json());
    if (!data.items.length) {
      const p = document.createElement("p");
      p.className = "hint-text";
      p.textContent = "아직 등록된 소식이 없습니다.";
      list.appendChild(p);
      return;
    }
    for (const item of data.items) {
      list.appendChild(renderNewsItem(item));
    }
  }

  function isSafeHttpUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function renderNewsItem(item) {
    const card = document.createElement("div");
    card.className = "news-item";

    const date = document.createElement("div");
    date.className = "news-date";
    date.textContent = item.date || "";

    const title = document.createElement("h3");
    title.className = "news-title";
    title.textContent = item.title || "";

    const summary = document.createElement("p");
    summary.textContent = item.summary || "";

    card.appendChild(date);
    card.appendChild(title);
    card.appendChild(summary);

    if (item.source_url && isSafeHttpUrl(item.source_url)) {
      const link = document.createElement("a");
      link.href = item.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "news-source";
      link.textContent = (item.source_name || "출처 보기") + " ↗";
      card.appendChild(link);
    }
    return card;
  }

  return { init };
})();
