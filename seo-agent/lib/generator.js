const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { buildPages, validatePage, canonicalUrl } = require('./core');
const { createRun, finishRun, saveAudit } = require('./storage');

function runWorker(page) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'render-worker.js'), { workerData: page });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`render worker exited with code ${code}`)); });
  });
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

async function writeSiteIndex(pages, outputRoot) {
  const links = pages.filter(page => !page.errors.length).map(page => `<li><a href="/${page.urlPath}">${page.title}</a><span>${page.page_type}</span></li>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Software comparisons and integrations</title><meta name="description" content="Structured comparisons and integration guides for B2B software, AI tools, and productivity platforms."><style>body{font-family:system-ui;max-width:980px;margin:0 auto;padding:36px 20px;color:#14213d;background:#f6f8fb}h1{font-size:42px}ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}li{background:#fff;padding:16px;border-radius:10px;box-shadow:0 3px 16px #14213d12}a{color:#1d6b52;font-weight:700;text-decoration:none}span{display:block;color:#6d7890;font-size:12px;text-transform:uppercase;margin-top:6px}</style></head><body><p>Programmatic SEO Agent</p><h1>Software comparisons and integrations</h1><p>Pages generated from structured tool and comparison records. Review each page for commercial accuracy before public publishing.</p><ul>${links}</ul></body></html>`;
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, 'index.html'), html);
}

async function writeSitemap(pages, outputRoot) {
  const urls = pages.filter(page => !page.errors.length).map(page => `<url><loc>${canonicalUrl(page.slug, page.page_type)}</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join('');
  await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}

async function generateSite({ pool, outputRoot = path.join(process.cwd(), 'seo'), concurrency = Number(process.env.SEO_CONCURRENCY || 8) } = {}) {
  if (!pool) throw new Error('A PostgreSQL pool is required');
  const { tools, comparisons } = await require('./storage').readCatalog(pool);
  const pages = buildPages(tools, comparisons);
  const runId = crypto.randomUUID();
  await createRun(pool, runId);
  const seenHashes = new Set();
  let generated = 0;
  let rejected = 0;
  const audits = [];
  try {
    const rendered = await mapConcurrent(pages, concurrency, async page => ({ page, ...(await runWorker(page)) }));
    for (const result of rendered) {
      const audit = validatePage(result.page, result.html, seenHashes);
      if (!audit.errors.length) seenHashes.add(audit.content_hash);
      const urlPath = result.page.page_type === 'alternative'
        ? `seo/alternatives/${result.page.slug}/index.html`
        : `seo/integrations/${result.page.slug}/index.html`;
      const destination = path.join(outputRoot, result.page.page_type === 'alternative' ? 'alternatives' : 'integrations', result.page.slug, 'index.html');
      if (!audit.errors.length) {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, result.html);
        generated += 1;
      } else {
        rejected += 1;
      }
      const audited = { ...result.page, ...audit, urlPath, title: result.page.page_type === 'alternative' ? `${result.page.primary.tool_name} vs ${result.page.competitor.tool_name}` : `How to connect ${result.page.primary.tool_name} to ${result.page.competitor.tool_name}` };
      audits.push(audited);
      await saveAudit(pool, runId, result.page, audit);
    }
    await writeSiteIndex(audits, outputRoot);
    await writeSitemap(audits, outputRoot);
    await finishRun(pool, runId, 'completed', generated, rejected);
    return { runId, generated, rejected, total: pages.length, audits };
  } catch (error) {
    await finishRun(pool, runId, 'failed', generated, rejected, error.message);
    throw error;
  }
}

module.exports = { generateSite, mapConcurrent, writeSiteIndex, writeSitemap };
