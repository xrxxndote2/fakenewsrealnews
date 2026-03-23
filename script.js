const leftCard = document.getElementById("leftPanel");
const rightCard = document.getElementById("rightPanel");
const nextRoundBtn = document.getElementById("nextRoundBtn");
const scoreChip = document.getElementById("scoreChip");
const highScoreEl = document.getElementById("highScoreDisplay");
const leftSource = document.getElementById("leftSource");
const rightSource = document.getElementById("rightSource");
const leftOverlay = document.getElementById("leftOverlay");
const rightOverlay = document.getElementById("rightOverlay");
const rightTrueBtn = document.getElementById("rightTrueBtn");
const rightFalseBtn = document.getElementById("rightFalseBtn");

const HIGH_SCORE_KEY = "fake-news-detektiv-high-score";

let score = 0;
let highScore = 0;
let revealed = false;
let currentRound = null;
let imageLoadGeneration = 0;

function loadHighScore() {
  try {
    const v = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10);
    highScore = Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    highScore = 0;
  }
}

function persistHighScore() {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  } catch {
    /* private mode */
  }
}

function updateScoreDisplays() {
  if (highScoreEl) {
    highScoreEl.textContent = `Rekord: ${highScore}`;
  }
  if (scoreChip) {
    scoreChip.textContent = `Pont: ${score}`;
  }
}

function setGlassButtonsDisabled(disabled) {
  if (rightTrueBtn) {
    rightTrueBtn.disabled = disabled;
  }
  if (rightFalseBtn) {
    rightFalseBtn.disabled = disabled;
  }
}

const fallbackImage =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1400' height='900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23111111'/%3E%3Cstop offset='100%25' stop-color='%231a1a1a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1400' height='900' fill='url(%23g)'/%3E%3Ctext x='700' y='430' fill='%23888' font-size='48' text-anchor='middle' font-family='Arial'%3ENo image%3C/text%3E%3C/svg%3E";

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function picsumFallbackForUrl(url) {
  return `https://picsum.photos/seed/${hashString(url || "x")}/1400/900`;
}

function setPanelImage(imgEl, articleUrl, previewUrl) {
  const primary = previewUrl || picsumFallbackForUrl(articleUrl);
  imgEl.onerror = () => {
    imgEl.onerror = null;
    if (imgEl.src !== picsumFallbackForUrl(`${articleUrl}_alt`)) {
      imgEl.src = picsumFallbackForUrl(`${articleUrl}_alt`);
      return;
    }
    imgEl.src = fallbackImage;
  };
  imgEl.src = primary;
}

function renderRound() {
  const [leftStory, rightStory] = currentRound;
  const leftImageEl = document.getElementById("leftImage");
  const rightImageEl = document.getElementById("rightImage");
  const leftWrap = leftCard.querySelector(".split-half__image-layer");
  const rightWrap = rightCard.querySelector(".split-half__image-layer");

  leftImageEl.removeAttribute("src");
  rightImageEl.removeAttribute("src");
  leftWrap.classList.add("is-loading");
  rightWrap.classList.add("is-loading");

  document.getElementById("leftSummary").textContent = leftStory.summary;
  leftSource.textContent = "FORRÁS: [Rejtett]";
  leftOverlay.textContent = "";
  leftOverlay.setAttribute("aria-hidden", "true");

  document.getElementById("rightSummary").textContent = rightStory.summary;
  rightSource.textContent = "FORRÁS: [Rejtett]";
  rightOverlay.textContent = "";
  rightOverlay.setAttribute("aria-hidden", "true");

  [leftCard, rightCard].forEach((card) => {
    card.classList.remove("revealed", "true", "false", "locked");
  });

  revealed = false;
  nextRoundBtn.disabled = true;
  setGlassButtonsDisabled(false);
  updateScoreDisplays();
}

async function loadRoundImagesFromArticles() {
  if (!currentRound || !window.NewsService?.fetchArticlePreviewImage) {
    return;
  }

  const generation = ++imageLoadGeneration;
  const leftStory = currentRound[0];
  const rightStory = currentRound[1];
  const leftImageEl = document.getElementById("leftImage");
  const rightImageEl = document.getElementById("rightImage");
  const leftWrap = leftCard.querySelector(".split-half__image-layer");
  const rightWrap = rightCard.querySelector(".split-half__image-layer");

  const [leftPreview, rightPreview] = await Promise.all([
    window.NewsService.fetchArticlePreviewImage(leftStory.url),
    window.NewsService.fetchArticlePreviewImage(rightStory.url),
  ]);

  if (generation !== imageLoadGeneration) {
    return;
  }

  const doneLoading = () => {
    leftWrap.classList.remove("is-loading");
    rightWrap.classList.remove("is-loading");
  };

  let pending = 2;
  const onDone = () => {
    pending -= 1;
    if (pending <= 0) {
      doneLoading();
    }
  };

  leftImageEl.addEventListener("load", onDone, { once: true });
  rightImageEl.addEventListener("load", onDone, { once: true });
  leftImageEl.addEventListener("error", onDone, { once: true });
  rightImageEl.addEventListener("error", onDone, { once: true });

  setPanelImage(leftImageEl, leftStory.url, leftPreview);
  setPanelImage(rightImageEl, rightStory.url, rightPreview);

  window.setTimeout(() => {
    if (generation === imageLoadGeneration) {
      doneLoading();
    }
  }, 12000);
}

function revealCards() {
  currentRound.forEach((story, idx) => {
    const card = idx === 0 ? leftCard : rightCard;
    const sourceEl = idx === 0 ? leftSource : rightSource;
    const overlayEl = idx === 0 ? leftOverlay : rightOverlay;

    card.classList.add("revealed", "locked");
    if (story.isTrue) {
      card.classList.add("true");
      overlayEl.textContent = "IGAZ";
    } else {
      card.classList.add("false");
      overlayEl.textContent = "HAMIS";
    }
    overlayEl.setAttribute("aria-hidden", "false");

    sourceEl.textContent = "";
    const label = document.createElement("span");
    label.textContent = "FORRÁS: ";
    const link = document.createElement("a");
    link.href = story.url;
    link.textContent = story.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    sourceEl.append(label, link);
  });

  revealed = true;
  setGlassButtonsDisabled(true);
}

function handleGuess(cardIndex) {
  if (!currentRound || revealed) {
    return;
  }

  const guessedStory = currentRound[cardIndex];
  const wasCorrect = !!guessedStory.isTrue;
  score = wasCorrect ? score + 1 : 0;
  if (wasCorrect && score > highScore) {
    highScore = score;
    persistHighScore();
  }
  revealCards();
  scoreChip.classList.add("bump");
  window.setTimeout(() => scoreChip.classList.remove("bump"), 350);
  updateScoreDisplays();
  nextRoundBtn.disabled = false;
}

function updateNewsStatusLine() {
  const el = document.getElementById("newsStatus");
  if (!el || !window.NewsService?.getLiveStatus) {
    return;
  }
  const st = window.NewsService.getLiveStatus();
  if (st.lastRefreshAt) {
    const t = new Date(st.lastRefreshAt).toLocaleString("hu-HU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    el.textContent = `Frissítve: ${t}`;
  } else {
    el.textContent = "";
  }
}

function startNewRound() {
  if (!window.NewsService || typeof window.NewsService.getRoundPair !== "function") {
    document.getElementById("leftSummary").textContent =
      "Hiba: a hírszolgáltatás nem töltődött be.";
    document.getElementById("rightSummary").textContent =
      "Ellenőrizd, hogy a newsService.js fájl elérhető.";
    setGlassButtonsDisabled(true);
    return;
  }

  currentRound = window.NewsService.getRoundPair();
  if (!currentRound) {
    document.getElementById("leftSummary").textContent =
      "Nem sikerült friss híreket betölteni (vagy nincs elég aktuális cikk a kiválasztott hírcsatornákon).";
    document.getElementById("rightSummary").textContent =
      "Internetkapcsolat és rss2json elérés szükséges. Próbáld újratölteni az oldalt később.";
    updateNewsStatusLine();
    nextRoundBtn.disabled = false;
    setGlassButtonsDisabled(true);
    return;
  }

  updateNewsStatusLine();
  renderRound();
  loadRoundImagesFromArticles();
}

loadHighScore();
updateScoreDisplays();

leftCard.addEventListener("click", () => handleGuess(0));

leftCard.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleGuess(0);
  }
});

rightTrueBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  handleGuess(1);
});

rightFalseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  handleGuess(0);
});

nextRoundBtn.addEventListener("click", async () => {
  if (!currentRound && window.NewsService?.refreshNow) {
    const status = document.getElementById("newsStatus");
    if (status) {
      status.textContent = "";
    }
    await window.NewsService.refreshNow();
  }
  startNewRound();
});

async function bootstrap() {
  const statusEl = document.getElementById("newsStatus");
  if (statusEl) {
    statusEl.textContent = "";
  }
  if (window.NewsService?.whenReady) {
    await window.NewsService.whenReady();
  }
  startNewRound();
}

bootstrap();
