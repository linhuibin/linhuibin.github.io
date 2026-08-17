import { readFile, writeFile } from "node:fs/promises";

const scholarUrl = "https://scholar.google.com/citations?user=JB81MwsAAAAJ&hl=en";
const dataFile = new URL("../../scholar.json", import.meta.url);
const indexFile = new URL("../../index.html", import.meta.url);
const current = JSON.parse(await readFile(dataFile, "utf8"));

try {
  const response = await fetch(scholarUrl, {
    signal: AbortSignal.timeout(10000),
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error("Google Scholar returned " + response.status);
  const html = await response.text();
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? html;
  const citationText = description.match(/Cited by[^0-9]*([0-9,]+)/i)?.[1];
  const citations = citationText ? Number(citationText.replace(/,/g, "")) : Number.NaN;
  if (!Number.isFinite(citations) || citations < Number(current.citations ?? 0)) {
    throw new Error("A valid non-decreasing citation count was not found");
  }
  await writeFile(dataFile, JSON.stringify({ citations, source: "Google Scholar", live: true, checkedAt: new Date().toISOString() }, null, 2) + "\n");
  const indexHtml = await readFile(indexFile, "utf8");
  const nextHtml = indexHtml.replace(
    /(<a\b[^>]*class="scholar-metric"[^>]*>[\s\S]*?<strong>)[^<]*(<\/strong>)/i,
    "$1" + citations.toLocaleString("en-US") + "$2",
  );
  if (nextHtml === indexHtml) throw new Error("The citation metric was not found in index.html");
  await writeFile(indexFile, nextHtml, "utf8");
  console.log("Google Scholar citations: " + citations);
} catch (error) {
  console.log("Keeping the existing citation count: " + error.message);
}