const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { tools, buildComparisons } = require('../catalog');
const { generateSite } = require('../lib/generator');

test('database-backed generator publishes validated pages through worker threads', async () => {
  const rows = tools.slice(0, 2).map((tool, index) => ({ ...tool, id: index + 1 }));
  const comparisons = buildComparisons(rows);
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'seo-agent-'));
  const fakePool = {
    async query(sql) {
      if (sql.includes('FROM software_tools')) return { rows };
      if (sql.includes('FROM tool_comparisons')) return { rows: comparisons };
      return { rows: [] };
    }
  };
  try {
    const result = await generateSite({ pool: fakePool, outputRoot, concurrency: 2 });
    assert.equal(result.total, 4);
    assert.equal(result.generated, 4);
    assert.equal(result.rejected, 0);
    assert.equal((await fs.readdir(path.join(outputRoot, 'alternatives'))).length, 2);
    assert.equal((await fs.readdir(path.join(outputRoot, 'integrations'))).length, 2);
    assert.match(await fs.readFile(path.join(outputRoot, 'sitemap.xml'), 'utf8'), /<urlset/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});
