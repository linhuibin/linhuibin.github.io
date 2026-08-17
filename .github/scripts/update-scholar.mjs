import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const authorId = "JB81MwsAAAAJ";
const defaultDataFile = new URL("../../scholar.json", import.meta.url);
const defaultIndexFile = new URL("../../index.html", import.meta.url);
const defaultEndpoint = "https://serpapi.com/search.json";

export function extractCitationCount(payload) {
  if (!payload || typeof payload !== "object" || payload.error) throw new Error("SerpApi returned an API error");
  const table = payload.cited_by?.table;
  const citationRow = Array.isArray(table) ? table.find((row) => row?.citations) : undefined;
  const citations = Number(citationRow?.citations?.all);
  if (!Number.isSafeInteger(citations) || citations < 0) throw new Error("SerpApi did not return a valid citation count");
  return citations;
}

export function updateStaticCitationFallback(html, citations) {
  const metricPattern = /<a\b(?=[^>]*\bclass="[^"]*\bscholar-metric\b[^"]*")[^>]*>[\s\S]*?<\/a>/;
  const metricMatch = html.match(metricPattern);
  if (!metricMatch) throw new Error("The static Scholar metric was not found in index.html");
  const labelPattern = /aria-label="[\d,]+ citations on Google Scholar"/;
  const valuePattern = /<strong>[\d,]+<\/strong>/;
  if (!labelPattern.test(metricMatch[0]) || !valuePattern.test(metricMatch[0])) throw new Error("The static Scholar metric has an unexpected format");
  const formatted = citations.toLocaleString("en-US");
  const updatedMetric = metricMatch[0]
    .replace(labelPattern, `aria-label="${formatted} citations on Google Scholar"`)
    .replace(valuePattern, `<strong>${formatted}</strong>`);
  return html.replace(metricPattern, updatedMetric);
}

export async function updateScholar({ apiKey = process.env.SERPAPI_KEY, dataFile = defaultDataFile, indexFile = defaultIndexFile, endpoint = defaultEndpoint, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!apiKey) throw new Error("SERPAPI_KEY is not configured");
  const [currentData, indexHtml] = await Promise.all([readFile(dataFile, "utf8"), readFile(indexFile, "utf8")]);
  const current = JSON.parse(currentData);
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set("engine", "google_scholar_author");
  requestUrl.searchParams.set("author_id", authorId);
  requestUrl.searchParams.set("hl", "en");
  requestUrl.searchParams.set("api_key", apiKey);
  const response = await fetchImpl(requestUrl, { signal: AbortSignal.timeout(20000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`SerpApi returned HTTP ${response.status}`);
  let payload; try { payload = await response.json(); } catch { throw new Error("SerpApi returned invalid JSON"); }
  const citations = extractCitationCount(payload);
  const previousCitations = Number(current.citations ?? 0);
  if (Number.isFinite(previousCitations) && citations < previousCitations) throw new Error("The citation count decreased; keeping the existing value");
  const next = { citations, source: "Google Scholar via SerpApi", live: true, checkedAt: now().toISOString() };
  const updatedIndex = updateStaticCitationFallback(indexHtml, citations);
  await Promise.all([writeFile(dataFile, JSON.stringify(next, null, 2) + "\n"), writeFile(indexFile, updatedIndex)]);
  return citations;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try { console.log(`Google Scholar citations via SerpApi: ${await updateScholar()}`); }
  catch (error) { console.error(`Scholar update failed; keeping the existing citation count: ${error.message}`); process.exitCode = 1; }
}
