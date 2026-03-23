/**
 * Élő hírek: magyar RSS (Telex, 444, HVG) + szatíra (HírCsárda, Babylon Bee, The Onion).
 * A szatíra-cikkek szövegét hírszerű, semleges „hírügynökségi” stílusra írjuk át — a cím
 * és az RSS-lead gyakran leleplező, ezért a játékban nem azok jelennek meg nyersen.
 * A böngészőből közvetlen RSS-hívás CORS miatt nem megbízható, ezért az rss2json.com
 * JSON API-t használjuk. Opcionális API-kulcs: https://rss2json.com
 *
 * Frissítés: betöltéskor, majd 30 percenként. Sikeres adat localStorage-ban (36 óráig),
 * hogy átmeneti hálózati hiba ne ürítse a játékot.
 */

const RSS2JSON_BASE = "https://api.rss2json.com/v1/api.json";
/** Opcionális: rss2json ingyenes kulcs a magasabb napi kvótához */
const RSS2JSON_API_KEY = "";

/** Csak ennyinél nem régebbi cikkek (RSS pubDate alapján) */
const MAX_ARTICLE_AGE_MS = 21 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const FEED_FETCH_TIMEOUT_MS = 15000;
const CACHE_KEY = "fake-news-detektiv-live-v2";
const CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_STORED_PER_SIDE = 80;

const REAL_FEEDS = [
  { rss: "https://telex.hu/rss", source: "Telex" },
  { rss: "https://444.hu/feed", source: "444" },
  { rss: "https://hvg.hu/rss", source: "HVG" },
];

/** Magyar szatíra ritkán frissül: hosszabb ablak, különben üres lenne a pool */
const SATIRE_HU_MAX_AGE_MS = 200 * 24 * 60 * 60 * 1000;

const SATIRE_FEEDS = [
  {
    rss: "https://hircsarda.hu/feed/",
    source: "HírCsárda (Szatíra)",
    lang: "hu",
    maxAgeMs: SATIRE_HU_MAX_AGE_MS,
    deceptive: true,
  },
  {
    rss: "https://babylonbee.com/feed",
    source: "Babylon Bee (Szatíra)",
    lang: "en",
    deceptive: true,
  },
  {
    rss: "https://theonion.com/rss",
    source: "The Onion (Szatíra)",
    lang: "en",
    deceptive: true,
  },
];

let liveReal = [];
let liveFake = [];
let lastRefreshAt = 0;

let readyResolve;
const readyPromise = new Promise((r) => {
  readyResolve = r;
});

function buildRss2JsonUrl(rssUrl) {
  let u = `${RSS2JSON_BASE}?rss_url=${encodeURIComponent(rssUrl)}`;
  if (RSS2JSON_API_KEY) {
    u += `&api_key=${encodeURIComponent(RSS2JSON_API_KEY)}`;
  }
  return u;
}

function parsePubDate(s) {
  if (!s) {
    return null;
  }
  const t = Date.parse(String(s).trim().replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

function isRecentWithin(pubDateStr, maxAgeMs) {
  const t = parsePubDate(pubDateStr);
  if (t === null) {
    return true;
  }
  return Date.now() - t <= maxAgeMs;
}

function cleanSnippet(text) {
  if (!text) {
    return "";
  }
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, max) {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max - 1)}…`;
}

function hashPick(str, n) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % n;
}

function headlineWireQuote(headline, preferTeaser) {
  const raw = headline.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (!raw) {
    return "";
  }
  if (preferTeaser) {
    const byDash = raw.split(/\s[–—]\s/);
    const first = byDash[0]?.trim() || raw;
    if (first.length >= 16 && first.length + 8 < raw.length) {
      return first.length > 92 ? `${first.slice(0, 89)}…` : first;
    }
    const byColon = raw.split(/:\s+/);
    if (byColon[0]?.length >= 16 && byColon.length > 1) {
      const c0 = byColon[0].trim();
      return c0.length > 92 ? `${c0.slice(0, 89)}…` : c0;
    }
  }
  return raw.length > 92 ? `${raw.slice(0, 89)}…` : raw;
}

/**
 * Az Onion / Bee címei és RSS-leadjei nyíltan viccesek; a játékban száraz, hírszerű angol
 * szöveget mutatunk, és a cím idézetét gyakran lerövidítjük, hogy kevésbé tűnjön szatírának.
 */
function deceptiveEnglishSatireSummary(headline) {
  const raw = headline.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (!raw) {
    return "Officials said they were reviewing unspecified administrative matters and would provide guidance when internal coordination concludes.";
  }
  const i = hashPick(raw, 6);
  const h = headlineWireQuote(raw, i % 2 === 1);
  const templates = [
    () =>
      `People briefed on internal paperwork described ongoing work related to circumstances summarized as “${h}.” They cautioned that preliminary accounts can change as agencies complete their review.`,
    () =>
      `In sector notes circulated this week, administrators reference a line item framed as “${h},” alongside reminders that corroboration standards vary by office before anything is treated as final.`,
    () =>
      `Coordination calls touched on reports catalogued under wording akin to “${h}.” One participant said the thread is being tracked, but no consolidated public summary has been authorized.`,
    () =>
      `Policy staff fielded questions about documents characterized in shorthand as matching “${h}.” Spokespeople declined to confirm specifics while a standard clearance process continues.`,
    () =>
      `Editors reviewing referral traffic saw repeated citations of a formulation along the lines of “${h},” attributed to early drafts; downstream reviewers have not validated the narrative for external use.`,
    () =>
      `Materials marked for follow-up list a scenario described, in meeting cadence, as “${h}.” Analysts noted that such labels often bundle disparate claims until a single accountable finding is issued.`,
  ];
  return templates[i]();
}

/** Magyar szatíra (HírCsárda): ugyanaz a semleges, hírszerű hangnem. */
function deceptiveHungarianSatireSummary(headline) {
  const raw = headline.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (!raw) {
    return "Illetékes körök szerint több, még véglegesítésre váró adminisztratív kérdés maradt nyitva; részletes tájékoztatást későbbre ígértek.";
  }
  const i = hashPick(raw, 6);
  const h = headlineWireQuote(raw, i % 2 === 1);
  const templates = [
    () =>
      `Több, egymástól független bejegyzés is utal egy olyan ügyre, amelyet közlemények „${h}” szóhasználattal említenek; a részletek hitelességét egyelőre különbözően ítélik a szerkesztőségek.`,
    () =>
      `Szakpolitikai kommentárok szerint belső egyeztetéseken megjelent egy összefoglaló, amelynek szó szerinti megjelölése: „${h}”; hivatalos megerősítés ebben a formában nem érkezett.`,
    () =>
      `Közösségi és médiacsatornákon terjedő idézetek egy része a következő állításcsoportot tartalmazza: „${h}”. Külső megfigyelők szerint a háttérben álló eseménysor még tisztázatlan.`,
    () =>
      `A nap folyamán több portál is idézte azt a – vitatott – megfogalmazást, amely így hangzik: „${h}”. Elemzők hangsúlyozták: a közlés eredete és szándéka külön vizsgálatot igényelhet.`,
    () =>
      `Tájékoztatási célú felületeken megjelent, hogy egyes összesítésekben szerepel egy, a közvita szélén emlegetett tétel („${h}”) is; az illetékes fórumok eddig nem tettek közzé egységes értelmezést.`,
    () =>
      `Hírgyűjtő rendszerek szerint több forrás is hivatkozott egy olyan rövid címkére, amely a(z) „${h}” szöveget tartalmazza; a bejegyzések valódiságáról megoszlottak a vélemények.`,
  ];
  return templates[i]();
}

function buildSatireArticle(item, sourceLabel, lang) {
  const title = cleanSnippet(item.title || "");
  if (!item.link || !title) {
    return null;
  }
  const summary =
    lang === "hu"
      ? deceptiveHungarianSatireSummary(title)
      : deceptiveEnglishSatireSummary(title);
  return {
    summary: truncate(summary, 420),
    source: sourceLabel,
    url: item.link,
    lang,
  };
}

function articleFromItem(item, source) {
  const title = cleanSnippet(item.title || "");
  const desc = cleanSnippet(item.description || item.content || "");
  if (!item.link) {
    return null;
  }
  if (!title && !desc) {
    return null;
  }
  const titlePrefix = title.slice(0, Math.min(24, title.length));
  let summary = title;
  if (desc.length > 15 && (titlePrefix.length === 0 || !desc.startsWith(titlePrefix))) {
    summary = `${title} ${desc}`.trim();
  }
  summary = truncate(summary, 400);
  return {
    summary,
    source,
    url: item.link,
  };
}

async function fetchOneFeed(feedConfig) {
  const url = buildRss2JsonUrl(feedConfig.rss);
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.items)) {
      return [];
    }
    const label = feedConfig.source || data.feed?.title || "Forrás";
    const maxAge = feedConfig.maxAgeMs ?? MAX_ARTICLE_AGE_MS;
    const out = [];
    for (const item of data.items.slice(0, 45)) {
      if (!isRecentWithin(item.pubDate, maxAge)) {
        continue;
      }
      let a;
      if (feedConfig.deceptive) {
        a = buildSatireArticle(item, label, feedConfig.lang || "en");
      } else {
        a = articleFromItem(item, label);
      }
      if (a) {
        out.push(a);
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((x) => {
    const key = x.url.split("?")[0];
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchAllPools() {
  const [realResults, fakeResults] = await Promise.all([
    Promise.all(REAL_FEEDS.map(fetchOneFeed)),
    Promise.all(SATIRE_FEEDS.map(fetchOneFeed)),
  ]);
  return {
    real: dedupeByUrl(realResults.flat()),
    fake: dedupeByUrl(fakeResults.flat()),
  };
}

function tryLoadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return false;
    }
    const { at, real, fake } = JSON.parse(raw);
    if (!Array.isArray(real) || !Array.isArray(fake)) {
      return false;
    }
    if (Date.now() - at > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
    if (real.length < 2 || fake.length < 2) {
      return false;
    }
    liveReal = real;
    liveFake = fake;
    lastRefreshAt = at;
    return true;
  } catch {
    return false;
  }
}

function saveCache() {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        at: lastRefreshAt,
        real: liveReal.slice(0, MAX_STORED_PER_SIDE),
        fake: liveFake.slice(0, MAX_STORED_PER_SIDE),
      })
    );
  } catch {
    /* kvóta / privát mód */
  }
}

async function refreshPools() {
  const { real, fake } = await fetchAllPools();
  if (real.length >= 2 && fake.length >= 2) {
    liveReal = real;
    liveFake = fake;
    lastRefreshAt = Date.now();
    saveCache();
    return true;
  }
  return false;
}

function startAutoRefresh() {
  window.setInterval(() => {
    refreshPools().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

async function initialize() {
  try {
    tryLoadCache();
    await refreshPools();
  } catch (e) {
    console.warn("NewsService init:", e);
  } finally {
    readyResolve();
    startAutoRefresh();
  }
}

initialize();

function shufflePairSides(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRoundPair() {
  if (liveReal.length < 1 || liveFake.length < 1) {
    return null;
  }
  const real = liveReal[Math.floor(Math.random() * liveReal.length)];
  const huFakes = liveFake.filter((x) => x.lang === "hu");
  const fakePool = huFakes.length > 0 ? huFakes : liveFake;
  let fake;
  let guard = 0;
  do {
    fake = fakePool[Math.floor(Math.random() * fakePool.length)];
    guard += 1;
  } while (fake.url === real.url && guard < 25);

  return shufflePairSides([
    { summary: real.summary, source: real.source, url: real.url, isTrue: true },
    { summary: fake.summary, source: fake.source, url: fake.url, isTrue: false },
  ]);
}

/**
 * Lekéri a cikk URL-jéhez tartozó előnézeti képet (Open Graph / oldal meta),
 * ami általában megegyezik a hír oldalán látható fő illusztrációval.
 * Közvetlenül a böngészőből nem lehet más domain HTML-jét scrape-elni (CORS),
 * ezért egy nyilvános link-preview API-t használunk.
 */
async function fetchArticlePreviewImage(articleUrl) {
  if (!articleUrl || typeof articleUrl !== "string") {
    return null;
  }
  const trimmed = articleUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  if (/^https?:\/\/(www\.)?example\.com/i.test(trimmed)) {
    return null;
  }

  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(trimmed)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    const data = payload?.data;
    const fromImage = data?.image?.url;
    const fromScreenshot = data?.screenshot?.url;
    const candidate = fromImage || fromScreenshot;
    return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
  } catch {
    return null;
  }
}

window.NewsService = {
  whenReady: () => readyPromise,
  getRoundPair,
  fetchArticlePreviewImage,
  /** Kényszerített háttér-frissítés (pl. gombhoz); Promise, nem blokkolja a UI-t */
  refreshNow: () => refreshPools(),
  getLiveStatus: () => {
    const fakeHu = liveFake.filter((x) => x.lang === "hu").length;
    const fakeEn = liveFake.filter((x) => x.lang === "en").length;
    return {
      realCount: liveReal.length,
      fakeCount: liveFake.length,
      fakeHuCount: fakeHu,
      fakeEnCount: fakeEn,
      lastRefreshAt,
      maxArticleAgeDays: MAX_ARTICLE_AGE_MS / (24 * 60 * 60 * 1000),
      satireHuMaxDays: SATIRE_HU_MAX_AGE_MS / (24 * 60 * 60 * 1000),
    };
  },
  getPairCount: () => Math.min(liveReal.length, liveFake.length),
};
