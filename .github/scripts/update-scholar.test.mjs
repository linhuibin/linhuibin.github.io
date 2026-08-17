import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { extractCitationCount, updateScholar, updateStaticCitationFallback } from "./update-scholar.mjs";

const responseData = (citations) => ({ cited_by: { table: [{ citations: { all: citations } }] } });
const metric = (citations = 108) => `<a class="scholar-metric" aria-label="${citations} citations on Google Scholar"><strong>${citations}</strong><span>citations</span></a>`;
async function temporarySite(citations = 108) {
  const directory = await mkdtemp(join(tmpdir(), "scholar-update-"));
  const dataPath = join(directory, "scholar.json"), indexPath = join(directory, "index.html");
  await Promise.all([writeFile(dataPath, JSON.stringify({ citations }) + "\n"), writeFile(indexPath, `<!doctype html>${metric(citations)}`)]);
  return { dataFile: pathToFileURL(dataPath), indexFile: pathToFileURL(indexPath) };
}
test("extracts citations", () => assert.equal(extractCitationCount(responseData(109)), 109));
test("updates the static fallback", () => assert.match(updateStaticCitationFallback(metric(108), 1000), /<strong>1,000<\/strong>/));
test("writes SerpApi data and index together", async () => {
  const files = await temporarySite();
  await updateScholar({ ...files, apiKey: "test", fetchImpl: async () => new Response(JSON.stringify(responseData(109))), now: () => new Date("2026-08-17T00:00:00Z") });
  assert.equal(JSON.parse(await readFile(files.dataFile, "utf8")).citations, 109);
  assert.match(await readFile(files.indexFile, "utf8"), /<strong>109<\/strong>/);
});
test("keeps files when the count decreases", async () => {
  const files = await temporarySite();
  await assert.rejects(updateScholar({ ...files, apiKey: "test", fetchImpl: async () => new Response(JSON.stringify(responseData(107))) }), /decreased/);
  assert.match(await readFile(files.indexFile, "utf8"), /<strong>108<\/strong>/);
});
