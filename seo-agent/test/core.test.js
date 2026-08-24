const test = require('node:test');
const assert = require('node:assert/strict');
const { tools, buildComparisons } = require('../catalog');
const { buildPages, renderPage, validatePage } = require('../lib/core');

test('catalog contains at least 100 seeded tools', () => {
  assert.equal(tools.length, 100);
  assert.equal(new Set(tools.map(tool => tool.slug)).size, tools.length);
  assert.ok(tools.every(tool => tool.tool_name && tool.source_url && tool.affiliate_url));
});

test('comparison generator creates two page types with deterministic slugs', () => {
  const comparisons = buildComparisons(tools.map((tool, index) => ({ ...tool, id: index + 1 })));
  assert.equal(comparisons.length, 200);
  assert.ok(comparisons.every(comparison => comparison.slug.includes('-vs-')));
  const pages = buildPages(tools.map((tool, index) => ({ ...tool, id: index + 1 })), comparisons);
  assert.equal(pages.length, 400);
  assert.equal(pages.filter(page => page.page_type === 'alternative').length, 200);
  assert.equal(pages.filter(page => page.page_type === 'integration').length, 200);
});

test('rendered alternative page contains immediate answer, matrix, CTA tracking, and JSON-LD', () => {
  const comparison = buildComparisons([{ ...tools[0], id: 1 }, { ...tools[1], id: 2 }])[0];
  const page = buildPages([{ ...tools[0], id: 1 }, { ...tools[1], id: 2 }], [comparison])[0];
  const html = renderPage(page);
  const audit = validatePage(page, html, new Set());
  assert.equal(audit.errors.length, 0);
  assert.match(html, /Quick answer/);
  assert.match(html, /class="matrix"/);
  assert.match(html, /utm_source=programmatic-seo/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /Pricing, Features &amp; Alternatives/);
});

test('duplicate hashes are rejected before publication', () => {
  const comparison = buildComparisons([{ ...tools[0], id: 1 }, { ...tools[1], id: 2 }])[0];
  const page = buildPages([{ ...tools[0], id: 1 }, { ...tools[1], id: 2 }], [comparison])[0];
  const html = renderPage(page);
  const hash = validatePage(page, html, new Set());
  const duplicate = validatePage(page, html, new Set([hash.content_hash]));
  assert.ok(duplicate.errors.includes('duplicate_content'));
});
