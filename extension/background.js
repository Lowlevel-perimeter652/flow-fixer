/**
 * Service worker: events, AUTO-THROTTLE, webRequest backup, badge.
 */
import { classify, severity, summarize } from "./lib/classify.js";
import { isGenerateUrl, contentLength } from "./lib/match.js";
import {
  SPEEDS,
  SPEED_BY_ID,
  DEFAULT_SPEED_ID,
  HARD_COOLDOWN_MS,
  speedIndex,
  speedByIndex,
  nextAutoIndex,
} from "./lib/speeds.js";

const MAX_EVENTS = 500;
const STORAGE_KEY = "flowFixerState";

const defaultState = () => ({
  events: [],
  sessionStartedAt: Date.now(),
  monitoring: true,
  autoThrottle: true,
  autoMode: true,
  speedId: DEFAULT_SPEED_ID,
  hardUntil: 0,
  okStreak: 0,
  lastLevel: "idle",
  lastToast: null,
  // diagnostics
  injectReadyAt: 0,
  injectPings: 0,
  webRequestHits: 0,
  lastUrlSample: "",
  lastActivityAt: 0,
});

async function loadState() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return { ...defaultState(), ...(data[STORAGE_KEY] || {}) };
}

async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY]: state });
}

function publicConfig(state) {
  return {
    monitoring: state.monitoring !== false,
    autoThrottle: !!state.autoThrottle,
    autoMode: !!state.autoMode,
    speedId: state.speedId || DEFAULT_SPEED_ID,
    hardUntil: state.hardUntil || 0,
  };
}

async function broadcastConfig(state) {
  const config = publicConfig(state);
  try {
    const tabs = await chrome.tabs.query({ url: ["https://labs.google/*", "http://labs.google/*"] });
    for (const t of tabs) {
      if (t.id != null) {
        chrome.tabs
          .sendMessage(t.id, { channel: "flow-fixer-config", config })
          .catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

function badgeFor(level, autoThrottle, armed) {
  if (level === "hard") return { text: "!", color: "#f85149" };
  if (level === "soft") return { text: "~", color: "#d29922" };
  if (level === "ok") return { text: "ok", color: "#3fb950" };
  if (level === "filter") return { text: "f", color: "#d29922" };
  if (autoThrottle && armed) return { text: "⏱", color: "#58a6ff" };
  if (armed) return { text: "·", color: "#8b949e" };
  return { text: "", color: "#8b949e" };
}

async function setBadge(state) {
  const summary = summarize(state.events || []);
  const armed =
    state.injectReadyAt > 0 ||
    state.webRequestHits > 0 ||
    (state.events && state.events.length > 0);
  const level =
    summary.level && summary.level !== "idle" ? summary.level : state.lastLevel || "idle";
  const b = badgeFor(level, state.autoThrottle, armed);
  await chrome.action.setBadgeText({ text: b.text });
  if (b.text) await chrome.action.setBadgeBackgroundColor({ color: b.color });
}

function displayLevel(state, summary) {
  if (summary.level && summary.level !== "idle") return summary.level;
  if (state.hardUntil && state.hardUntil > Date.now()) return "hard";
  // armed but no generates yet
  if (state.injectReadyAt || state.webRequestHits || (state.events && state.events.length)) {
    if (state.events && state.events.length) return summary.level || "ok";
    return "armed";
  }
  return "idle";
}

async function recordGenerate(ev, source) {
  const state = await loadState();
  if (!state.monitoring) return;

  const cls = classify(ev.status, ev.respText || "", ev.respSize ?? -1);
  const full = {
    id: `${ev.startedAt || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: ev.startedAt || Date.now(),
    endedAt: ev.endedAt || Date.now(),
    status: ev.status,
    cls,
    sev: severity(cls),
    model: ev.model || "?",
    batchId: ev.batchId || null,
    seed: ev.seed || null,
    url: ev.url || "",
    paced: ev.paced || null,
    source: source || "inject",
    respSnippet: (ev.respText || "").slice(0, 280),
  };

  state.events.push(full);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }
  state.lastActivityAt = Date.now();
  state.lastUrlSample = (ev.url || "").slice(0, 160);

  const summary = summarize(state.events);
  let level = summary.level;
  if (full.sev === "hard") level = "hard";
  else if (full.sev === "soft" && level !== "hard") level = "soft";
  else if (full.sev === "filter" && level !== "hard" && level !== "soft")
    level = "filter";
  state.lastLevel = level;

  if (state.autoThrottle && state.autoMode) {
    if (full.sev === "hard") {
      state.speedId = "molasses";
      state.hardUntil = Date.now() + HARD_COOLDOWN_MS;
      state.okStreak = 0;
    } else if (full.sev === "soft") {
      const i = speedIndex(state.speedId);
      state.speedId = speedByIndex(nextAutoIndex(i, "soft", 0)).id;
      state.okStreak = 0;
    } else if (full.sev === "ok") {
      state.okStreak = (state.okStreak || 0) + 1;
      const i = speedIndex(state.speedId);
      const ni = nextAutoIndex(i, "ok", state.okStreak);
      if (ni !== i) state.speedId = speedByIndex(ni).id;
    }
  }

  await saveState(state);
  await setBadge(state);
  await broadcastConfig(state);

  try {
    chrome.runtime.sendMessage({
      channel: "flow-fixer-update",
      summary: summarize(state.events),
      last: full,
      config: publicConfig(state),
      displayLevel: displayLevel(state, summarize(state.events)),
    });
  } catch {
    /* no listeners */
  }
}

async function ingest(payload) {
  if (payload.type === "ready" || payload.type === "need_config" || payload.type === "ping") {
    const state = await loadState();
    state.injectReadyAt = Date.now();
    state.injectPings = (state.injectPings || 0) + 1;
    state.lastActivityAt = Date.now();
    await saveState(state);
    await setBadge(state);
    await broadcastConfig(state);
    return;
  }

  if (payload.type === "throttle") {
    const state = await loadState();
    if (payload.speedId && SPEED_BY_ID[payload.speedId]) {
      state.speedId = payload.speedId;
    }
    if (payload.action === "hard_cooldown") {
      state.hardUntil = payload.hardUntil || Date.now() + HARD_COOLDOWN_MS;
      state.okStreak = 0;
      state.lastLevel = "hard";
      state.speedId = "molasses";
    }
    if (payload.action === "soft_downshift") {
      state.okStreak = 0;
      state.lastLevel = "soft";
    }
    if (payload.action === "ok" && state.autoMode) {
      state.okStreak = (state.okStreak || 0) + 1;
      const i = speedIndex(state.speedId);
      const ni = nextAutoIndex(i, "ok", state.okStreak);
      if (ni !== i) state.speedId = speedByIndex(ni).id;
    }
    await saveState(state);
    await broadcastConfig(state);
    await setBadge(state);
    return;
  }

  if (payload.type === "generate") {
    await recordGenerate(payload, "inject");
  }
}

// Backup path: see generate traffic even if page fetch patch misses
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isGenerateUrl(details.url)) return;
    if (details.method && details.method.toUpperCase() === "OPTIONS") return;

    (async () => {
      const state = await loadState();
      if (!state.monitoring) return;
      state.webRequestHits = (state.webRequestHits || 0) + 1;
      state.lastUrlSample = details.url.split("?")[0].slice(0, 160);
      state.lastActivityAt = Date.now();
      await saveState(state);

      // Prefer inject (has response body). Only log via webRequest if inject looks dead.
      const injectAlive =
        state.injectReadyAt && Date.now() - state.injectReadyAt < 20000;
      if (injectAlive) {
        await setBadge(await loadState());
        return;
      }

      const t = details.timeStamp || Date.now();
      const size = contentLength(details.responseHeaders);
      let respText = "";
      if (details.statusCode === 429 && size === 287) {
        respText = "PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC";
      } else if (details.statusCode === 429 && size === 297) {
        respText = "PUBLIC_ERROR_USER_REQUESTS_THROTTLED";
      }

      await recordGenerate(
        {
          startedAt: t,
          endedAt: t,
          status: details.statusCode,
          url: details.url.split("?")[0],
          respText,
          respSize: size,
          model: "?",
        },
        "webRequest"
      );
    })().catch(() => {});
  },
  {
    urls: ["https://aisandbox-pa.googleapis.com/*"],
  },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.channel === "flow-fixer" && msg.payload) {
    ingest(msg.payload).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg && msg.channel === "flow-fixer-cmd") {
    (async () => {
      if (msg.cmd === "getState") {
        const state = await loadState();
        const summary = summarize(state.events);
        sendResponse({
          state,
          summary,
          speeds: SPEEDS,
          config: publicConfig(state),
          displayLevel: displayLevel(state, summary),
        });
        return;
      }
      if (msg.cmd === "getConfig") {
        const state = await loadState();
        sendResponse({ config: publicConfig(state) });
        return;
      }
      if (msg.cmd === "clear") {
        const prev = await loadState();
        const s = defaultState();
        s.monitoring = prev.monitoring;
        s.autoThrottle = prev.autoThrottle;
        s.autoMode = prev.autoMode;
        s.speedId = prev.speedId;
        s.injectReadyAt = prev.injectReadyAt;
        await saveState(s);
        await setBadge(s);
        await broadcastConfig(s);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setMonitoring") {
        const state = await loadState();
        state.monitoring = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setAutoThrottle") {
        const state = await loadState();
        state.autoThrottle = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        await setBadge(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setAutoMode") {
        const state = await loadState();
        state.autoMode = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setSpeed") {
        const state = await loadState();
        if (SPEED_BY_ID[msg.speedId]) {
          state.speedId = msg.speedId;
          await saveState(state);
          await broadcastConfig(state);
        }
        sendResponse({ ok: true, speedId: state.speedId });
        return;
      }
      if (msg.cmd === "clearHard") {
        const state = await loadState();
        state.hardUntil = 0;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "export") {
        const state = await loadState();
        const summary = summarize(state.events);
        sendResponse({
          ok: true,
          report: {
            tool: "flow-fixer-extension",
            version: "0.2.2",
            exportedAt: new Date().toISOString(),
            sessionStartedAt: new Date(state.sessionStartedAt).toISOString(),
            autoThrottle: state.autoThrottle,
            autoMode: state.autoMode,
            speedId: state.speedId,
            injectReadyAt: state.injectReadyAt,
            webRequestHits: state.webRequestHits,
            summary,
            events: state.events.map((e) => ({
              startedAt: new Date(e.startedAt).toISOString(),
              status: e.status,
              cls: e.cls,
              model: e.model,
              batchId: e.batchId,
              paced: e.paced,
              source: e.source,
            })),
          },
        });
        return;
      }
      sendResponse({ ok: false, error: "unknown cmd" });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  await saveState(defaultState());
  await setBadge(defaultState());
});
