const crypto = require('crypto');

const SITE_URL = (process.env.SEO_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function canonicalUrl(slug, pageType = 'alternative') {
  const section = pageType === 'integration' ? 'integrations' : 'alternatives';
  return `${SITE_URL}/seo/${section}/${slug}`;
}

function pageMeta(page) {
  if (page.page_type === 'alternative') {
    return {
      title: `${page.primary.tool_name} vs ${page.competitor.tool_name} (2026): Pricing, Features & Alternatives`,
      description: `Compare ${page.primary.tool_name} and ${page.competitor.tool_name} for ${page.comparison.use_case}, including pricing, trials, ratings, and key differences.`,
      heading: `${page.primary.tool_name} vs ${page.competitor.tool_name}`
    };
  }
  return {
    title: `How to Connect ${page.primary.tool_name} to ${page.competitor.tool_name} via API & Automation`,
    description: `Learn how to connect ${page.primary.tool_name} to ${page.competitor.tool_name} for ${page.comparison.use_case}, with practical automation steps and integration options.`,
    heading: `How to Connect ${page.primary.tool_name} to ${page.competitor.tool_name}`
  };
}

function answerBox(page) {
  const { primary, competitor, comparison } = page;
  if (page.page_type === 'alternative') {
    return `<section class="answer-box" aria-label="Quick answer"><strong>Quick answer:</strong> ${escapeHtml(comparison.verdict)} ${escapeHtml(comparison.key_difference)}</section>`;
  }
  return `<section class="answer-box" aria-label="Integration answer"><strong>Quick answer:</strong> Connect ${escapeHtml(primary.tool_name)} to ${escapeHtml(competitor.tool_name)} with an API or automation workflow. Start by authenticating both accounts, map the trigger to the destination action, then test with a sample record.</section>`;
}

function featureMatrix(page) {
  const { primary, competitor } = page;
  const rows = [
    ['Monthly price', `$${Number(primary.monthly_price).toFixed(2)}`, `$${Number(competitor.monthly_price).toFixed(2)}`],
    ['Free trial', primary.has_free_trial ? 'Yes' : 'No', competitor.has_free_trial ? 'Yes' : 'No'],
    ['Seeded rating', `${Number(primary.rating).toFixed(1)} / 5`, `${Number(competitor.rating).toFixed(1)} / 5`],
    ['Best fit', primary.category.replace(/_/g, ' '), competitor.category.replace(/_/g, ' ')],
    ['Official website', `<a href="${escapeHtml(primary.source_url)}" rel="nofollow noopener">Visit site</a>`, `<a href="${escapeHtml(competitor.source_url)}" rel="nofollow noopener">Visit site</a>`]
  ];
  return `<table class="matrix"><thead><tr><th>Feature</th><th>${escapeHtml(primary.tool_name)}</th><th>${escapeHtml(competitor.tool_name)}</th></tr></thead><tbody>${rows.map(row => `<tr><th>${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}</tbody></table>`;
}

function cta(page, tool, position) {
  const href = `${tool.affiliate_url}${tool.affiliate_url.includes('?') ? '&' : '?'}utm_source=programmatic-seo&utm_medium=organic&utm_campaign=${page.page_type}&utm_content=${page.comparison.slug}&utm_position=${position}`;
  return `<a class="cta" href="${escapeHtml(href)}" rel="sponsored nofollow noopener">Check ${escapeHtml(tool.tool_name)} pricing</a>`;
}

function faqJsonLd(page) {
  const { primary, competitor, comparison } = page;
  const question = page.page_type === 'alternative'
    ? `Which is better for ${comparison.use_case}, ${primary.tool_name} or ${competitor.tool_name}?`
    : `How do I connect ${primary.tool_name} to ${competitor.tool_name}?`;
  const answer = page.page_type === 'alternative'
    ? comparison.verdict
    : `Use an API or an automation platform to authenticate both services, map the source trigger to the destination action, and verify the workflow with a test record.`;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }] };
}

function productJsonLd(page) {
  const { primary } = page;
  return { '@context': 'https://schema.org', '@type': 'Product', name: primary.tool_name, url: primary.source_url, aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(primary.rating), bestRating: 5, ratingCount: 1 }, offers: { '@type': 'Offer', price: Number(primary.monthly_price).toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: primary.source_url } };
}

function renderPage(page) {
  const meta = pageMeta(page);
  const canonical = canonicalUrl(page.slug, page.page_type);
  const intro = page.page_type === 'alternative'
    ? `A structured comparison of ${page.primary.tool_name} and ${page.competitor.tool_name} for ${page.comparison.use_case}.`
    : `A practical integration guide for teams connecting ${page.primary.tool_name} and ${page.competitor.tool_name} for ${page.comparison.use_case}.`;
  const steps = page.page_type === 'integration'
    ? `<ol class="steps"><li>Create or select API credentials in both tools.</li><li>Choose the event that starts the workflow and the action that should follow.</li><li>Map fields, run a test, and monitor the first successful sync.</li></ol>`
    : `<p>${escapeHtml(page.comparison.key_difference)}</p><p>${escapeHtml(page.comparison.verdict)}</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(meta.title)}</title><meta name="description" content="${escapeHtml(meta.description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><style>${styles()}</style><script type="application/ld+json">${JSON.stringify(faqJsonLd(page))}</script><script type="application/ld+json">${JSON.stringify(productJsonLd(page))}</script></head>
<body><main class="container"><nav><a href="/seo">Programmatic SEO Index</a><span> / ${escapeHtml(page.page_type)}</span></nav><article><p class="eyebrow">${page.page_type === 'alternative' ? 'Software comparison' : 'Integration guide'}</p><h1>${escapeHtml(meta.heading)}</h1>${answerBox(page)}<p class="intro">${escapeHtml(intro)}</p>${featureMatrix(page)}<h2>${page.page_type === 'alternative' ? 'What is the key difference?' : 'Connection steps'}</h2>${steps}<div class="actions">${cta(page, page.primary, 'primary')}${cta(page, page.competitor, 'competitor')}</div></article></main></body></html>`;
}

function styles() {
  return `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#14213d;background:#f6f8fb}*{box-sizing:border-box}body{margin:0}.container{max-width:980px;margin:0 auto;padding:32px 20px 64px}nav{font-size:14px;color:#62708a;margin-bottom:42px}nav a{color:#1d6b52;text-decoration:none;font-weight:700}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:#1d6b52;font-size:12px;font-weight:800}h1{font-size:clamp(34px,6vw,62px);line-height:1.03;max-width:850px;margin:8px 0 22px}.answer-box{background:#e6f6ee;border-left:5px solid #1d8a5a;padding:20px 22px;border-radius:10px;font-size:19px;line-height:1.55;margin:24px 0}.intro{font-size:18px;line-height:1.6;color:#52617a}.matrix{border-collapse:collapse;width:100%;margin:26px 0 34px;background:#fff;box-shadow:0 8px 30px rgba(20,33,61,.08);border-radius:12px;overflow:hidden}.matrix th,.matrix td{padding:15px 16px;text-align:left;border-bottom:1px solid #e8edf4}.matrix thead th{background:#14213d;color:#fff;font-size:14px}.matrix tbody th{color:#52617a;font-weight:700}.matrix a{color:#1d6b52}.steps{line-height:1.8;background:#fff;padding:22px 22px 22px 46px;border-radius:12px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.cta{display:inline-block;background:#e8743b;color:#fff;padding:13px 18px;border-radius:8px;font-weight:800;text-decoration:none}.cta:hover{background:#cb5622}h2{margin-top:38px}`;
}

function validatePage(page, html, allHashes = new Set()) {
  const errors = [];
  if (!page.slug || !/^[-a-z0-9]+$/.test(page.slug)) errors.push('invalid_slug');
  if (!page.primary || !page.competitor) errors.push('missing_tools');
  if (!page.comparison || !page.comparison.use_case) errors.push('missing_comparison');
  for (const field of ['tool_name','slug','monthly_price','affiliate_url','source_url']) {
    if (page.primary && (page.primary[field] === undefined || page.primary[field] === null || page.primary[field] === '')) errors.push(`primary_missing_${field}`);
    if (page.competitor && (page.competitor[field] === undefined || page.competitor[field] === null || page.competitor[field] === '')) errors.push(`competitor_missing_${field}`);
  }
  if (!html.includes('class="answer-box"')) errors.push('missing_above_fold_answer');
  if (!html.includes('class="matrix"')) errors.push('missing_feature_matrix');
  if (!html.includes('application/ld+json')) errors.push('missing_json_ld');
  if (!html.includes('utm_source=programmatic-seo')) errors.push('missing_cta_tracking');
  const content_hash = crypto.createHash('sha256').update(html).digest('hex');
  if (allHashes.has(content_hash)) errors.push('duplicate_content');
  return { errors, content_hash };
}

function buildPages(tools, comparisons) {
  const byId = new Map(tools.filter(t => t.id != null).map(tool => [Number(tool.id), tool]));
  return comparisons.map(comparison => {
    const primary = byId.get(Number(comparison.primary_tool_id)) || tools.find(t => t.slug === comparison.primary_tool_slug);
    const competitor = byId.get(Number(comparison.competitor_tool_id)) || tools.find(t => t.slug === comparison.competitor_tool_slug);
    return { page_type: 'alternative', slug: comparison.slug, primary, competitor, comparison };
  }).concat(comparisons.map(comparison => {
    const primary = byId.get(Number(comparison.primary_tool_id)) || tools.find(t => t.slug === comparison.primary_tool_slug);
    const competitor = byId.get(Number(comparison.competitor_tool_id)) || tools.find(t => t.slug === comparison.competitor_tool_slug);
    return { page_type: 'integration', slug: `how-to-connect-${primary.slug}-to-${competitor.slug}`, primary, competitor, comparison };
  }));
}

module.exports = { buildPages, renderPage, validatePage, canonicalUrl, SITE_URL };
