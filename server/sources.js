// Adaptadores de fuentes de empleo gratuitas. Cada uno normaliza a:
// { source, title, company, location, remote, salary, url, description, tags, postedAt, lang }
import { getSettings } from './store.js';
import { PUBLIC, htmlToText, politeJson } from './hoard-commons/web.js';

const TIMEOUT = 15_000;
const UA = 'Mozilla/5.0 (JubhuntersHoard personal tracker)';
// The biggest board (Arbeitnow) answers with ~2.7 MB a page, so the default 3 MB of the shared fetcher is too tight.
const MAX_BYTES = 12 * 1024 * 1024;

// The text of an API's HTML fragment (every visible word, no page chrome to drop): the shared converter, with the list items kept
// as "- " bullets because the descriptions are read by a person and by the scoring prompt.
export function stripHtml(html) {
  const text = htmlToText(String(html || '').replace(/<li\b[^>]*>/gi, '<li>- '), { dropChrome: false }).text;
  return text.replace(/^- *\n+/gm, '- ');
}

function matches(query, ...fields) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}

// One JSON API call through the shared polite fetcher: public addresses only, no redirects, at least a second between two calls to
// the same host, a size cap and a timeout. Throws an Error with a sentence for the person ("HTTP 429", "timeout ...").
export async function getJson(url, { headers = {}, profile = PUBLIC } = {}) {
  const r = await politeJson(url, { userAgent: UA, timeoutMs: TIMEOUT, maxBytes: MAX_BYTES, headers, profile });
  if (r.ok) return r.data;
  throw new Error(r.code === 'http' ? `HTTP ${r.status}${r.retryAfterMs ? ` (reintenta en ${Math.ceil(r.retryAfterMs / 1000)} s)` : ''}` : r.error);
}

// --- Remotive: remoto mundial, sin key ---
async function remotive({ query, getJson }) {
  const data = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=50`);
  return (data.jobs || []).map((j) => ({
    source: 'remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    salary: j.salary || '',
    url: j.url,
    description: stripHtml(j.description).slice(0, 6000),
    tags: j.tags || [],
    postedAt: j.publication_date || null,
    lang: 'en',
  }));
}

// --- Arbeitnow: Europa, sin key ---
async function arbeitnow({ query, getJson }) {
  const pages = [1, 2];
  const all = [];
  for (const p of pages) {
    const data = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
    all.push(...(data.data || []));
  }
  return all
    .filter((j) => matches(query, j.title, j.description || '', (j.tags || []).join(' ')))
    .map((j) => ({
      source: 'arbeitnow',
      title: j.title,
      company: j.company_name,
      location: j.location || '',
      remote: !!j.remote,
      salary: '',
      url: j.url,
      description: stripHtml(j.description).slice(0, 6000),
      tags: j.tags || [],
      postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      lang: 'en',
    }));
}

// --- RemoteOK: remoto, sin key ---
async function remoteok({ query, getJson }) {
  const data = await getJson('https://remoteok.com/api');
  return (Array.isArray(data) ? data : [])
    .filter((j) => j && j.position)
    .filter((j) => matches(query, j.position, j.description || '', (j.tags || []).join(' ')))
    .slice(0, 50)
    .map((j) => ({
      source: 'remoteok',
      title: j.position,
      company: j.company || '',
      location: j.location || 'Remote',
      remote: true,
      salary: j.salary_min ? `$${j.salary_min}-${j.salary_max || '?'}` : '',
      url: j.url,
      description: stripHtml(j.description).slice(0, 6000),
      tags: j.tags || [],
      postedAt: j.date || null,
      lang: 'en',
    }));
}

// --- Adzuna: España incluida, requiere key gratuita (developer.adzuna.com) ---
async function adzuna({ query, location, getJson }) {
  const { adzunaAppId, adzunaAppKey, adzunaCountry } = getSettings();
  if (!adzunaAppId || !adzunaAppKey) {
    throw new Error('Configura app_id/app_key de Adzuna en Ajustes (gratis en developer.adzuna.com)');
  }
  const params = new URLSearchParams({
    app_id: adzunaAppId,
    app_key: adzunaAppKey,
    what: query,
    results_per_page: '50',
    'content-type': 'application/json',
  });
  if (location) params.set('where', location);
  const data = await getJson(`https://api.adzuna.com/v1/api/jobs/${adzunaCountry || 'es'}/search/1?${params}`);
  return (data.results || []).map((j) => ({
    source: 'adzuna',
    title: j.title?.replace(/<[^>]+>/g, '') || '',
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    remote: null,
    salary: j.salary_min ? `${Math.round(j.salary_min)}-${Math.round(j.salary_max || j.salary_min)} €` : '',
    url: j.redirect_url,
    description: stripHtml(j.description).slice(0, 6000),
    tags: [],
    postedAt: j.created || null,
    lang: (getSettings().adzunaCountry || 'es') === 'es' ? 'es' : 'en',
  }));
}

// --- Hacker News "Who is hiring" (Algolia, sin key) ---
async function hackernews({ query, getJson }) {
  const stories = await getJson(
    'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6'
  );
  const hiring = (stories.hits || []).find((h) => /who is hiring/i.test(h.title || ''));
  if (!hiring) return [];
  const comments = await getJson(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${hiring.objectID}&query=${encodeURIComponent(query)}&hitsPerPage=40`
  );
  return (comments.hits || [])
    .filter((c) => c.comment_text)
    .map((c) => {
      const text = stripHtml(c.comment_text);
      const firstLine = text.split('\n')[0].slice(0, 120);
      return {
        source: 'hackernews',
        title: firstLine || 'HN Who is hiring',
        company: (firstLine.split('|')[0] || '').trim().slice(0, 60),
        location: /remote/i.test(text) ? 'Remote' : '',
        remote: /remote/i.test(text) ? true : null,
        salary: '',
        url: `https://news.ycombinator.com/item?id=${c.objectID}`,
        description: text.slice(0, 6000),
        tags: [],
        postedAt: c.created_at || null,
        lang: 'en',
      };
    });
}

// --- Jobicy: remoto mundial, sin key ---
async function jobicy({ query, getJson }) {
  const firstTerm = query.trim().split(/\s+/)[0] || '';
  const data = await getJson(
    `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(firstTerm)}`
  );
  return (data.jobs || [])
    .filter((j) => matches(query, j.jobTitle, j.jobExcerpt || '', j.jobIndustry?.join?.(' ') || String(j.jobIndustry || '')))
    .map((j) => ({
      source: 'jobicy',
      title: j.jobTitle,
      company: j.companyName || '',
      location: j.jobGeo || 'Remote',
      remote: true,
      salary: '',
      url: j.url,
      description: stripHtml(j.jobDescription || j.jobExcerpt).slice(0, 6000),
      tags: [j.jobLevel, ...(Array.isArray(j.jobIndustry) ? j.jobIndustry : [])].filter(Boolean),
      postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
      lang: 'en',
    }));
}

// --- Himalayas: remoto mundial, sin key ---
async function himalayas({ query, getJson }) {
  const data = await getJson('https://himalayas.app/jobs/api?limit=100');
  return (data.jobs || [])
    .filter((j) => matches(query, j.title, j.excerpt || '', (j.categories || []).join(' ')))
    .slice(0, 50)
    .map((j) => ({
      source: 'himalayas',
      title: j.title,
      company: j.companyName || '',
      location: (j.locationRestrictions || []).join(', ') || 'Remote',
      remote: true,
      salary: j.minSalary ? `${j.minSalary}-${j.maxSalary || '?'} ${j.currency || ''}`.trim() : '',
      url: j.applicationLink || j.guid,
      description: stripHtml(j.description).slice(0, 6000),
      tags: j.categories || [],
      postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
      lang: 'en',
    }));
}

const ADAPTERS = { remotive, arbeitnow, remoteok, adzuna, hackernews, jobicy, himalayas };

export const SOURCE_INFO = [
  { id: 'adzuna', label: 'Adzuna (España, requiere key gratis)', needsKey: true },
  { id: 'remotive', label: 'Remotive (remoto)', needsKey: false },
  { id: 'arbeitnow', label: 'Arbeitnow (Europa)', needsKey: false },
  { id: 'remoteok', label: 'RemoteOK (remoto)', needsKey: false },
  { id: 'jobicy', label: 'Jobicy (remoto)', needsKey: false },
  { id: 'himalayas', label: 'Himalayas (remoto)', needsKey: false },
  { id: 'hackernews', label: 'HN Who is hiring', needsKey: false },
];

// `fetchJson` is only replaced by tests.
export async function searchAll({ query, location, sources }, { fetchJson = getJson } = {}) {
  const chosen = (sources?.length ? sources : Object.keys(ADAPTERS)).filter((s) => ADAPTERS[s]);
  const settled = await Promise.allSettled(chosen.map((s) => ADAPTERS[s]({ query, location, getJson: fetchJson })));
  const results = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(...r.value);
    else errors.push({ source: chosen[i], error: r.reason?.message || String(r.reason) });
  });
  // dedupe por url
  const seen = new Set();
  const deduped = results.filter((r) => {
    const k = (r.url || r.title + r.company).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { results: deduped, errors };
}
