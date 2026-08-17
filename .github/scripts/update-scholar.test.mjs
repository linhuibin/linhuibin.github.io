import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { extractCitationCount, updateScholar } from "./update-scholar.mjs";

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

async function temporaryDataFile(citations = 107) {
  const directory = await mkdtemp(join(tmpdir(), "scholar-update-"));
  const path = join(directory, "scholar.json");
  await writeFile(path, JSON.stringify({ citations }) + "\n");
  return pathToFileURL(path);
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

test("writes a successful SerpApi update", async () => {
  const dataFile = await temporaryDataFile();
  const fetchImpl = async (url) => {
    assert.equal(url.searchParams.get("author_id"), "JB81MwsAAAAJ");
    assert.equal(url.searchParams.get("api_key"), "test-secret");
    return new Response(JSON.stringify(scholarResponse(108)), { status: 200 });
  };

  const citations = await updateScholar({
    apiKey: "test-secret",
    dataFile,
    fetchImpl,
    now: () => new Date("2026-08-17T02:23:00.000Z"),
  });
  const saved = JSON.parse(await readFile(dataFile, "utf8"));

  assert.equal(citations, 108);
  assert.deepEqual(saved, {
    citations: 108,
    source: "Google Scholar via SerpApi",
    live: true,
    checkedAt: "2026-08-17T02:23:00.000Z",
  });
});

test("keeps the existing file when SerpApi returns 403", async () => {
  const dataFile = await temporaryDataFile();
  const before = await readFile(dataFile, "utf8");

  await assert.rejects(
    updateScholar({
      apiKey: "test-secret",
      dataFile,
      fetchImpl: async () => new Response("", { status: 403 }),
    }),
    /HTTP 403/,
  );

  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("rejects a decreasing count and keeps the existing file", async () => {
  const dataFile = await temporaryDataFile();
  const before = await readFile(dataFile, "utf8");

  await assert.rejects(
    updateScholar({
      apiKey: "test-secret",
      dataFile,
      fetchImpl: async () => new Response(
        JSON.stringify(scholarResponse(106)),
        { status: 200 },
      ),
    }),
    /citation count decreased/,
  );

  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("requires a SerpApi secret", async () => {
  await assert.rejects(
    updateScholar({ apiKey: "" }),
    /SERPAPI_KEY is not configured/,
  );
});
