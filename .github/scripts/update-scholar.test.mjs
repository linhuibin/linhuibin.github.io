import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  extractCitationCount,
  updateScholar,
  updateStaticCitationFallback,
} from "./update-scholar.mjs";

function scholarResponse(citations) {
  return {
    cited_by: {
      table: [
        { citations: { all: citations, since_2021: citations - 10 } },
        { h_index: { all: 8, since_2021: 7 } },
      ],
    },
  };
}

function scholarMetric(citations = 107) {
  return `<a class="scholar-metric" href="https://scholar.google.com" aria-label="${citations} citations on Google Scholar"><strong>${citations}</strong><span>citations</span></a>`;
}

async function temporarySite(citations = 107) {
  const directory = await mkdtemp(join(tmpdir(), "scholar-update-"));
  const dataPath = join(directory, "scholar.json");
  const indexPath = join(directory, "index.html");
  await Promise.all([
    writeFile(dataPath, JSON.stringify({ citations }) + "\n"),
    writeFile(indexPath, `<!doctype html><main>${scholarMetric(citations)}</main>`),
  ]);
  return {
    dataFile: pathToFileURL(dataPath),
    indexFile: pathToFileURL(indexPath),
  };
}

test("extracts the all-time citation count", () => {
  assert.equal(extractCitationCount(scholarResponse(108)), 108);
});

test("rejects a response without a citation count", () => {
  assert.throws(
    () => extractCitationCount({ cited_by: { table: [] } }),
    /valid citation count/,
  );
});

test("updates the static citation fallback", () => {
  const updated = updateStaticCitationFallback(
    `<!doctype html><main>${scholarMetric(999)}</main>`,
    1000,
  );

  assert.match(updated, /aria-label="1,000 citations on Google Scholar"/);
  assert.match(updated, /<strong>1,000<\/strong>/);
});

test("writes successful SerpApi data and its static fallback", async () => {
  const { dataFile, indexFile } = await temporarySite();
  const fetchImpl = async (url) => {
    assert.equal(url.searchParams.get("author_id"), "JB81MwsAAAAJ");
    assert.equal(url.searchParams.get("api_key"), "test-secret");
    return new Response(JSON.stringify(scholarResponse(108)), { status: 200 });
  };

  const citations = await updateScholar({
    apiKey: "test-secret",
    dataFile,
    indexFile,
    fetchImpl,
    now: () => new Date("2026-08-17T02:23:00.000Z"),
  });
  const saved = JSON.parse(await readFile(dataFile, "utf8"));
  const savedIndex = await readFile(indexFile, "utf8");

  assert.equal(citations, 108);
  assert.deepEqual(saved, {
    citations: 108,
    source: "Google Scholar via SerpApi",
    live: true,
    checkedAt: "2026-08-17T02:23:00.000Z",
  });
  assert.match(savedIndex, /aria-label="108 citations on Google Scholar"/);
  assert.match(savedIndex, /<strong>108<\/strong>/);
});

test("keeps the existing files when SerpApi returns 403", async () => {
  const { dataFile, indexFile } = await temporarySite();
  const beforeData = await readFile(dataFile, "utf8");
  const beforeIndex = await readFile(indexFile, "utf8");

  await assert.rejects(
    updateScholar({
      apiKey: "test-secret",
      dataFile,
      indexFile,
      fetchImpl: async () => new Response("", { status: 403 }),
    }),
    /HTTP 403/,
  );

  assert.equal(await readFile(dataFile, "utf8"), beforeData);
  assert.equal(await readFile(indexFile, "utf8"), beforeIndex);
});

test("rejects a decreasing count and keeps the existing files", async () => {
  const { dataFile, indexFile } = await temporarySite();
  const beforeData = await readFile(dataFile, "utf8");
  const beforeIndex = await readFile(indexFile, "utf8");

  await assert.rejects(
    updateScholar({
      apiKey: "test-secret",
      dataFile,
      indexFile,
      fetchImpl: async () => new Response(
        JSON.stringify(scholarResponse(106)),
        { status: 200 },
      ),
    }),
    /citation count decreased/,
  );

  assert.equal(await readFile(dataFile, "utf8"), beforeData);
  assert.equal(await readFile(indexFile, "utf8"), beforeIndex);
});

test("requires a SerpApi secret", async () => {
  await assert.rejects(
    updateScholar({ apiKey: "" }),
    /SERPAPI_KEY is not configured/,
  );
});
