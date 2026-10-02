// Which addresses Jubhunter's Hoard may reach on the person's behalf (the job page they paste to be read) and how it reaches them.
//
// By default only the public internet: the shared fetcher (hoard-commons/web.js) refuses loopback, private, link-local and cloud
// metadata addresses and checks every redirect hop. A person who keeps postings on their own network (an intranet careers page)
// opts in with JOBHUNT_ALLOW_PRIVATE_URLS=1, which switches to the "operator_local" profile of the commons. The variable is read on
// every call, so a test (or a settings change plus a restart) never needs a reload.
import { envFlag } from "./hoard-commons/server.js";
import { PUBLIC, OPERATOR_LOCAL, webGet } from "./hoard-commons/web.js";
import { webFetchOrLocal } from "./hoard-commons/fam-web.js";

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) JubhuntersHoard/1.0";

export const allowPrivateUrls = (env = process.env) => envFlag("JOBHUNT_ALLOW_PRIVATE_URLS", false, env);

/** The safety profile of the commons for fetches the person asked for. */
export const fetchProfile = (env = process.env) => (allowPrivateUrls(env) ? OPERATOR_LOCAL : PUBLIC);

const snakeKey = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * One GET of a page as the hub's snake_case answer: { ok, status, final_url, text, content_type, truncated, blocked, block_reason,
 * error, error_kind, via }. Public addresses go through the family hub when it is there (one polite fetcher for every app: shared
 * spacing and block cooldowns, and its browser tier for pages that need one) and through the shared local fetcher otherwise; an
 * opted-in private network is always fetched locally, because the hub only reaches the public internet.
 */
export async function getPage(url, { timeoutMs = 20_000, maxBytes = 3 * 1024 * 1024 } = {}) {
  const common = { accept: "html", timeoutMs, maxBytes };
  if (allowPrivateUrls()) {
    const fr = await webGet(url, { ...common, profile: OPERATOR_LOCAL, userAgent: USER_AGENT });
    const { body, ...rest } = fr;
    const out = {};
    for (const [k, v] of Object.entries(rest)) out[snakeKey(k)] = v;
    return { ...out, via: "local" };
  }
  return webFetchOrLocal(url, {
    ...common, respectRobots: false,
    localGet: (u, o) => webGet(u, { ...o, profile: PUBLIC, userAgent: USER_AGENT }),
  });
}

/** A fetch that did not give a page, as a sentence for the person. */
export function pageProblem(res) {
  if (res.truncated || res.text_truncated) return "La página es demasiado grande para leerla.";
  // the local fetcher calls any 403/429 "blocked" with the reason http_<status>: that is just the status, said below
  if (res.blocked && !/^http_\d+$/.test(String(res.block_reason || ""))) return `La página bloquea las lecturas automáticas (${res.block_reason || "bloqueo"}).`;
  switch (res.error_kind) {
    case "policy": return "Esa dirección apunta a este equipo o a una red privada: Jubhunter's Hoard solo abre páginas públicas (JOBHUNT_ALLOW_PRIVATE_URLS=1 lo permite).";
    case "content": return "El enlace no devuelve una página web.";
    case "http": return `No pude descargar la página (HTTP ${res.status}).`;
    default: return res.status >= 400 ? `No pude descargar la página (HTTP ${res.status}).` : "No pude descargar la página.";
  }
}
