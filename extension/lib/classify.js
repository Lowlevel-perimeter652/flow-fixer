/**
 * Port of flowfixer.analyze classification (subset) for the browser extension.
 */

export const SOFT = [
  "PUBLIC_ERROR_USER_REQUESTS_THROTTLED",
  "USER_REQUESTS_THROTTLED",
];
export const HARD = [
  "PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC",
  "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
];
export const FILTERS = [
  "PUBLIC_ERROR_SEXUAL",
  "PUBLIC_ERROR_PROMINENT_PEOPLE_FILTER_FAILED",
  "PUBLIC_ERROR_UNSAFE_GENERATION",
];

// Observed ~2026 sizes for empty-body 429s. Prefer enums; sizes are a fallback only.
// Use small bands so minor JSON whitespace/field edits don't total-fail classification.
const SIZE_HARD_LO = 280;
const SIZE_HARD_HI = 292;
const SIZE_SOFT_LO = 290;
const SIZE_SOFT_HI = 310;

/** Fallback when body missing — returns [cls, lowConfidence] */
export function classify429BySize(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return ["429_NO_BODY", true];
  // Prefer soft band when overlapping ambiguity: soft was measured at 297, hard 287
  if (n >= SIZE_HARD_LO && n <= SIZE_HARD_HI && !(n >= 293 && n <= SIZE_SOFT_HI)) {
    // 280-292 → hard (classic 287)
    if (n <= 292) return ["HARD_UNUSUAL", true];
  }
  if (n >= 293 && n <= SIZE_SOFT_HI) return ["SOFT_THROTTLE", true];
  if (n >= SIZE_HARD_LO && n <= 292) return ["HARD_UNUSUAL", true];
  return [`429_NO_BODY_size${n}`, true];
}

export function classify(status, body, size) {
  body = body || "";
  if (status === 200) return "OK";
  for (const r of HARD) {
    if (body.includes(r)) return "HARD_UNUSUAL";
  }
  for (const r of SOFT) {
    if (body.includes(r)) return "SOFT_THROTTLE";
  }
  // Partial body / truncated
  if (status === 429 && body) {
    if (/TOO_MUCH|UNUSUAL_ACTIVITY/i.test(body)) return "HARD_UNUSUAL";
    if (/THROTTLED|too quickly/i.test(body)) return "SOFT_THROTTLE";
  }
  if (status === 429 && !body) {
    return classify429BySize(size)[0];
  }
  if (status === 403) {
    for (const r of HARD) {
      if (body.includes(r)) return "HARD_UNUSUAL";
    }
    if (/UNUSUAL|recaptcha|TOO_MUCH/i.test(body)) return "HARD_UNUSUAL";
    return "HARD_403";
  }
  for (const m of FILTERS) {
    if (body.includes(m)) return m.replace("PUBLIC_ERROR_", "FILTER_");
  }
  if (status === 400) {
    const m = body.match(/PUBLIC_ERROR_[A-Z0-9_]+/);
    return m ? `FILTER_${m[0].replace("PUBLIC_ERROR_", "")}` : "FILTER_OTHER_400";
  }
  return `STATUS_${status}`;
}

export function severity(cls) {
  if (cls === "OK") return "ok";
  if (cls === "SOFT_THROTTLE") return "soft";
  if (cls === "HARD_UNUSUAL" || cls === "HARD_403") return "hard";
  if (String(cls).startsWith("FILTER")) return "filter";
  // Unknown 429 body: treat as soft for auto-throttle (less punitive) but still show in feed
  if (cls === "429_NO_BODY" || String(cls).startsWith("429_NO_BODY_size")) return "soft";
  if (String(cls).startsWith("429")) return "hard";
  return "other";
}

/**
 * Rebuild fan-position stats from timed events (gap <= 2s = same cluster).
 */
export function fanStats(events, gapMs = 2000) {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => a.startedAt - b.startedAt);
  const clusters = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startedAt - sorted[i - 1].startedAt <= gapMs) {
      cur.push(sorted[i]);
    } else {
      clusters.push(cur);
      cur = [sorted[i]];
    }
  }
  clusters.push(cur);

  const pos = {};
  for (const c of clusters) {
    c.forEach((ev, i) => {
      if (!pos[i]) pos[i] = { ok: 0, total: 0 };
      pos[i].total += 1;
      if (ev.status === 200 || ev.cls === "OK") pos[i].ok += 1;
    });
  }
  return Object.keys(pos)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => ({
      pos: i,
      ok: pos[i].ok,
      total: pos[i].total,
      pct: pos[i].total ? (100 * pos[i].ok) / pos[i].total : 0,
    }));
}

export function summarize(events) {
  const classHist = {};
  const modelHist = {};
  let firstSoft = null;
  let firstHard = null;
  for (const e of events) {
    classHist[e.cls] = (classHist[e.cls] || 0) + 1;
    modelHist[e.model || "?"] = (modelHist[e.model || "?"] || 0) + 1;
    if (e.cls === "SOFT_THROTTLE" && firstSoft == null) firstSoft = e.startedAt;
    if (
      (e.cls === "HARD_UNUSUAL" || e.cls === "HARD_403") &&
      firstHard == null
    ) {
      firstHard = e.startedAt;
    }
  }
  const fan = fanStats(events);
  const hard = (classHist.HARD_UNUSUAL || 0) + (classHist.HARD_403 || 0);
  const soft = classHist.SOFT_THROTTLE || 0;
  const ok = classHist.OK || 0;
  const filter = Object.entries(classHist)
    .filter(([k]) => k.startsWith("FILTER") || k.includes("SEXUAL") || k.includes("UNSAFE"))
    .reduce((a, [, v]) => a + v, 0);
  let level = "idle";
  if (hard) level = "hard";
  else if (soft) level = "soft";
  else if (ok) level = "ok";
  else if (events.length) level = "other";

  const passPct = events.length ? Math.round((100 * ok) / events.length) : 0;

  return {
    total: events.length,
    classHist,
    modelHist,
    fan,
    firstSoft,
    firstHard,
    level,
    hard,
    soft,
    ok,
    filter,
    passPct,
  };
}
