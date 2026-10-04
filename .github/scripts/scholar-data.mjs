export function normalizeScholarData(value, now = Date.now()) {
  if (!value || !Number.isSafeInteger(value.citations) || value.citations < 0) return null;
  const checked = Date.parse(value.checkedAt ?? "");
  if (!Number.isFinite(checked) || checked > now + 5 * 60_000) return null;
  return {
    citations: value.citations,
    source: String(value.source ?? "Google Scholar"),
    checkedAt: new Date(checked).toISOString(),
    live: value.live === true && now - checked <= 48 * 3_600_000,
  };
}

export function selectScholarData(values, now = Date.now()) {
  const valid = values.map((value) => normalizeScholarData(value, now)).filter(Boolean);
  valid.sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt) || b.citations - a.citations);
  return valid[0] ?? null;
}

export function updateStaticScholarMetric(html, value) {
  const data = normalizeScholarData(value);
  if (!data) throw new Error("No verified citation data is available; refusing to publish an invented count.");
  const pattern = /<a\b(?=[^>]*\bclass="[^"]*\bscholar-metric\b[^"]*")[^>]*>[\s\S]*?<\/a>/;
  const match = html.match(pattern);
  if (!match || !/<strong>[\d,]+<\/strong>/.test(match[0])) throw new Error("The static Scholar metric was not found in index.html");
  const count = data.citations.toLocaleString("en-US");
  let metric = match[0]
    .replace(/\sdata-scholar-(?:checked-at|live)="[^"]*"/g, "")
    .replace(/^<a\b/, `<a data-scholar-checked-at="${data.checkedAt}" data-scholar-live="${data.live}"`)
    .replace(/aria-label="[\d,]+ citations on Google Scholar"/, `aria-label="${count} citations on Google Scholar"`)
    .replace(/<strong>[\d,]+<\/strong>/, `<strong>${count}</strong>`)
    .replace(/title="[^"]*"/, `title="${data.live ? "Automatically updated from Google Scholar" : "Last verified Google Scholar count"}"`)
    .replace(/\s*<i\b[^>]*>live<\/i>/g, "");
  if (data.live) metric = metric.replace(/(<small>Google Scholar)\s*(<\/small>)/, '$1 <i aria-label="live data">live</i>$2');
  return html.replace(pattern, metric);
}
