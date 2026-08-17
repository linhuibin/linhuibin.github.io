import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const authorId = "JB81MwsAAAAJ";
const defaultDataFile = new URL("../../scholar.json", import.meta.url);
const defaultEndpoint = "https://serpapi.com/search.json";

export function extractCitationCount(payload) {
  if (!payload || typeof payload !== "object" || payload.error) {
    throw new Error("SerpApi returned an API error");
  }

  const table = payload.cited_by?.table;
  const citationRow = Array.isArray(table)
    ? table.find((row) => row?.citations)
    : undefined;
  const citations = Number(citationRow?.citations?.all);

  if (!Number.isSafeInteger(citations) || citations < 0) {
    throw new Error("SerpApi did not return a valid citation count");
  }

  return citations;
}

export async function updateScholar({
  apiKey = process.env.SERPAPI_KEY,
  dataFile = defaultDataFile,
  endpoint = defaultEndpoint,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  if (!apiKey) {
    throw new Error("SERPAPI_KEY is not configured");
  }

  const current = JSON.parse(await readFile(dataFile, "utf8"));
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set("engine", "google_scholar_author");
  requestUrl.searchParams.set("author_id", authorId);
  requestUrl.searchParams.set("hl", "en");
  requestUrl.searchParams.set("api_key", apiKey);

  const response = await fetchImpl(requestUrl, {
    signal: AbortSignal.timeout(20000),
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`SerpApi returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("SerpApi returned invalid JSON");
  }

  const citations = extractCitationCount(payload);
  const previousCitations = Number(current.citations ?? 0);
  if (Number.isFinite(previousCitations) && citations < previousCitations) {
    throw new Error("The citation count decreased; keeping the existing value");
  }

  const next = {
    citations,
    source: "Google Scholar via SerpApi",
    live: true,
    checkedAt: now().toISOString(),
  };
  await writeFile(dataFile, JSON.stringify(next, null, 2) + "\n");
  return citations;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const citations = await updateScholar();
    console.log(`Google Scholar citations via SerpApi: ${citations}`);
  } catch (error) {
    console.error(`Scholar update failed; keeping the existing citation count: ${error.message}`);
    process.exitCode = 1;
  }
}
