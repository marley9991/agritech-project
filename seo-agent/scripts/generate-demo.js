const fs = require('fs/promises');
const path = require('path');
const { tools, buildComparisons } = require('../catalog');
const { buildPages, renderPage, validatePage } = require('../lib/core');
const { writeSiteIndex, writeSitemap } = require('../lib/generator');

(async () => {
  const rows = tools.map((tool, index) => ({ ...tool, id: index + 1 }));
  const comparisons = buildComparisons(rows);
  const pages = buildPages(rows, comparisons);
  const outputRoot = path.join(process.cwd(), 'seo');
  const seen = new Set();
  const audits = [];
  for (const page of pages) {
    const html = renderPage(page);
    const audit = validatePage(page, html, seen);
    if (!audit.errors.length) {
      seen.add(audit.content_hash);
      const relative = page.page_type === 'alternative' ? `seo/alternatives/${page.slug}/index.html` : `seo/integrations/${page.slug}/index.html`;
      const destination = path.join(process.cwd(), relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, html);
      audits.push({ ...page, ...audit, urlPath: relative, title: page.slug });
    } else {
      audits.push({ ...page, ...audit, urlPath: '', title: page.slug });
    }
  }
  await writeSiteIndex(audits, outputRoot);
  await writeSitemap(audits, outputRoot);
  const rejected = audits.filter(audit => audit.errors.length).length;
  console.log(JSON.stringify({ success: rejected === 0, tools: rows.length, comparisons: comparisons.length, pages: pages.length, generated: seen.size, rejected }, null, 2));
  if (rejected) process.exitCode = 2;
})();
