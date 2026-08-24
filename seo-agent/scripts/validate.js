const fs = require('fs/promises');
const path = require('path');
const { validatePage } = require('../lib/core');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

(async () => {
  const root = path.join(process.cwd(), 'seo');
  try {
    const files = await walk(root);
    const hashes = new Set();
    const errors = [];
    for (const file of files.filter(file => file !== path.join(root, 'index.html'))) {
      const html = await fs.readFile(file, 'utf8');
      const page = { slug: path.basename(path.dirname(file)), page_type: file.includes(`${path.sep}alternatives${path.sep}`) ? 'alternative' : 'integration', primary: { tool_name: 'placeholder', slug: 'placeholder', monthly_price: 0, affiliate_url: 'https://example.com', source_url: 'https://example.com', has_free_trial: true, rating: 5 }, competitor: { tool_name: 'placeholder', slug: 'placeholder-2', monthly_price: 0, affiliate_url: 'https://example.com', source_url: 'https://example.com', has_free_trial: true, rating: 5 }, comparison: { use_case: 'validation', key_difference: 'validation', verdict: 'validation' } };
      const audit = validatePage(page, html, hashes);
      if (audit.errors.length) errors.push({ file: path.relative(process.cwd(), file), errors: audit.errors });
      else hashes.add(audit.content_hash);
    }
    const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
    const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    const uniqueUrls = new Set(sitemapUrls);
    if (sitemapUrls.length !== uniqueUrls.size) errors.push({ file: 'seo/sitemap.xml', errors: ['duplicate_sitemap_urls'] });
    if (sitemapUrls.length !== hashes.size) errors.push({ file: 'seo/sitemap.xml', errors: [`page_url_count_mismatch:${sitemapUrls.length}:${hashes.size}`] });
    const summary = { success: errors.length === 0, pages: hashes.size, sitemap_urls: sitemapUrls.length, errors };
    console.log(JSON.stringify(summary, null, 2));
    if (errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
