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
const langToggleBtn = document.getElementById("langToggle");
const brandEl = document.querySelector(".brand");

const HIGH_SCORE_KEY = "fake-news-detektiv-high-score";
const LANG_KEY = "fake-news-detektiv-lang";

const UI_TEXT = {
  hu: {
    brand: "Fake News Detektív",
    trueStamp: "IGAZ",
    falseStamp: "HAMIS",
    nextRound: "Következő kör",
    hiddenSource: "FORRÁS: [Rejtett]",
    sourcePrefix: "FORRÁS: ",
    statusUpdatedPrefix: "Frissítve: ",
    translating: "Fordítás alatt…",
    errorLeft: "Hiba: a hírszolgáltatás nem töltődött be.",
    errorRight: "Ellenőrizd, hogy a newsService.js fájl elérhető.",
    noNewsLeft:
      "Nem sikerült friss híreket betölteni (vagy nincs elég aktuális cikk a kiválasztott hírcsatornákon).",
    noNewsRight:
      "Internetkapcsolat és rss2json elérés szükséges. Próbáld újratölteni az oldalt később.",
  },
  en: {
    brand: "Fake News Detective",
    trueStamp: "TRUE",
    falseStamp: "FALSE",
    nextRound: "Next round",
    hiddenSource: "SOURCE: [Hidden]",
    sourcePrefix: "SOURCE: ",
    statusUpdatedPrefix: "Updated: ",
    translating: "Translating…",
    errorLeft: "Error: news service did not load.",
    errorRight: "Check that newsService.js is available.",
    noNewsLeft:
      "Could not load fresh news (or there are not enough recent items in the selected feeds).",
    noNewsRight:
      "Internet connection and rss2json access are required. Try reloading later.",
  },
};

let score = 0;
let highScore = 0;
let revealed = false;
let currentRound = null;
let imageLoadGeneration = 0;
let displayLang = "hu";
let translateGeneration = 0;

function safeGetLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / quota
  }
}

function initLanguage() {
  const saved = safeGetLocalStorage(LANG_KEY);
  if (saved === "en" || saved === "hu") {
    displayLang = saved;
  }
}

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
    highScoreEl.textContent =
      displayLang === "hu" ? `Rekord: ${highScore}` : `High score: ${highScore}`;
  }
  if (scoreChip) {
    scoreChip.textContent =
      displayLang === "hu" ? `Pont: ${score}` : `Score: ${score}`;
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
  const leftSummaryEl = document.getElementById("leftSummary");
  const rightSummaryEl = document.getElementById("rightSummary");

  leftImageEl.removeAttribute("src");
  rightImageEl.removeAttribute("src");
  leftWrap.classList.add("is-loading");
  rightWrap.classList.add("is-loading");

  leftSummaryEl.textContent = leftStory.summary;
  rightSummaryEl.textContent = rightStory.summary;

  leftSource.textContent = UI_TEXT[displayLang].hiddenSource;
  leftOverlay.textContent = "";
  leftOverlay.setAttribute("aria-hidden", "true");

  rightSource.textContent = UI_TEXT[displayLang].hiddenSource;
  rightOverlay.textContent = "";
  rightOverlay.setAttribute("aria-hidden", "true");

  [leftCard, rightCard].forEach((card) => {
    card.classList.remove("revealed", "true", "false", "locked");
  });

  revealed = false;
  nextRoundBtn.disabled = true;
  setGlassButtonsDisabled(false);
  updateScoreDisplays();

  // Ha angol a nézet, automatikusan lefordítjuk a szöveget (RSS-ből jövő nyelvtől függetlenül).
  void updateDisplayedSummaries();
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
      overlayEl.textContent = UI_TEXT[displayLang].trueStamp;
    } else {
      card.classList.add("false");
      overlayEl.textContent = UI_TEXT[displayLang].falseStamp;
    }
    overlayEl.setAttribute("aria-hidden", "false");

    sourceEl.textContent = "";
    const label = document.createElement("span");
    label.textContent = UI_TEXT[displayLang].sourcePrefix;
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
    const locale = displayLang === "hu" ? "hu-HU" : "en-US";
    const t = new Date(st.lastRefreshAt).toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    el.textContent = `${UI_TEXT[displayLang].statusUpdatedPrefix}${t}`;
  } else {
    el.textContent = "";
  }
}

function startNewRound() {
  if (!window.NewsService || typeof window.NewsService.getRoundPair !== "function") {
    document.getElementById("leftSummary").textContent =
      UI_TEXT[displayLang].errorLeft;
    document.getElementById("rightSummary").textContent =
      UI_TEXT[displayLang].errorRight;
    setGlassButtonsDisabled(true);
    return;
  }

  currentRound = window.NewsService.getRoundPair();
  if (!currentRound) {
    document.getElementById("leftSummary").textContent =
      UI_TEXT[displayLang].noNewsLeft;
    document.getElementById("rightSummary").textContent =
      UI_TEXT[displayLang].noNewsRight;
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

function setUiLanguage(lang) {
  if (lang !== "hu" && lang !== "en") {
    return;
  }
  displayLang = lang;
  safeSetLocalStorage(LANG_KEY, lang);

  if (langToggleBtn) {
    langToggleBtn.textContent = lang;
  }
  if (brandEl) {
    brandEl.textContent = UI_TEXT[displayLang].brand;
  }
  if (nextRoundBtn) {
    nextRoundBtn.textContent = UI_TEXT[displayLang].nextRound;
  }
  if (rightTrueBtn) {
    rightTrueBtn.textContent = UI_TEXT[displayLang].trueStamp;
    rightTrueBtn.setAttribute(
      "aria-label",
      `A jobb oldali hír ${displayLang === "hu" ? "igaz" : "true"}`
    );
  }
  if (rightFalseBtn) {
    rightFalseBtn.textContent = UI_TEXT[displayLang].falseStamp;
    rightFalseBtn.setAttribute(
      "aria-label",
      `A jobb oldali hír ${displayLang === "hu" ? "hamis" : "false"}`
    );
  }

  // Rekord/pont + stílusos UI elemek azonnali frissítése.
  updateScoreDisplays();
  updateNewsStatusLine();

  if (currentRound) {
    // Ha már felfedtük, szinkronizáljuk a bélyeget és a forrás címkéjét.
    if (revealed) {
      currentRound.forEach((story, idx) => {
        const sourceEl = idx === 0 ? leftSource : rightSource;
        const overlayEl = idx === 0 ? leftOverlay : rightOverlay;
        overlayEl.textContent = story.isTrue
          ? UI_TEXT[displayLang].trueStamp
          : UI_TEXT[displayLang].falseStamp;
        overlayEl.setAttribute("aria-hidden", "false");

        sourceEl.textContent = "";
        const label = document.createElement("span");
        label.textContent = UI_TEXT[displayLang].sourcePrefix;
        const link = document.createElement("a");
        link.href = story.url;
        link.textContent = story.source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        sourceEl.append(label, link);
      });
    } else {
      leftSource.textContent = UI_TEXT[displayLang].hiddenSource;
      rightSource.textContent = UI_TEXT[displayLang].hiddenSource;
    }

    // A lebegő összefoglalók automatikus fordítása.
    void updateDisplayedSummaries();
  }
}

function getStoryLang(story) {
  return story?.lang === "en" || story?.lang === "hu" ? story.lang : "hu";
}

async function translateText(text, sourceLang, targetLang) {
  if (!text || typeof text !== "string") {
    return text;
  }
  if (sourceLang === targetLang) {
    return text;
  }

  const cacheKey = `fake-news-detektiv-translate-v1:${sourceLang}:${targetLang}:${hashString(
    text
  )}`;
  const cached = safeGetLocalStorage(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    // CORS-barát, ingyenes fordító endpoint; a válasz tipikusan responseData.translatedText mezőt tartalmaz.
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return text;
    }
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (typeof translated !== "string" || translated.trim().length === 0) {
      return text;
    }
    safeSetLocalStorage(cacheKey, translated);
    return translated;
  } catch {
    return text;
  } finally {
    window.clearTimeout(timer);
  }
}

async function updateDisplayedSummaries() {
  if (!currentRound) {
    return;
  }

  const gen = ++translateGeneration;
  const [leftStory, rightStory] = currentRound;

  const leftSummaryEl = document.getElementById("leftSummary");
  const rightSummaryEl = document.getElementById("rightSummary");
  if (!leftSummaryEl || !rightSummaryEl) {
    return;
  }

  const leftSourceLang = getStoryLang(leftStory);
  const rightSourceLang = getStoryLang(rightStory);

  const leftNeeds = leftSourceLang !== displayLang;
  const rightNeeds = rightSourceLang !== displayLang;

  if (leftNeeds) {
    leftSummaryEl.textContent = UI_TEXT[displayLang].translating;
  }
  if (rightNeeds) {
    rightSummaryEl.textContent = UI_TEXT[displayLang].translating;
  }

  const [leftTranslated, rightTranslated] = await Promise.all([
    translateText(leftStory.summary, leftSourceLang, displayLang),
    translateText(rightStory.summary, rightSourceLang, displayLang),
  ]);

  if (gen !== translateGeneration) {
    return;
  }

  leftSummaryEl.textContent = leftTranslated || leftStory.summary;
  rightSummaryEl.textContent = rightTranslated || rightStory.summary;
}

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

initLanguage();
setUiLanguage(displayLang);

if (langToggleBtn) {
  langToggleBtn.addEventListener("click", () => {
    setUiLanguage(displayLang === "hu" ? "en" : "hu");
  });
}

bootstrap();
