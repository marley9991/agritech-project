const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { tools: catalogTools, buildComparisons } = require('../catalog');

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/agriconnect',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
  });
}

async function ensureSchema(pool) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function seedCatalog(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = new Map();
    for (const tool of catalogTools) {
      const { rows: [saved] } = await client.query(`
        INSERT INTO software_tools (tool_name, slug, category, monthly_price, has_free_trial, rating, affiliate_url, logo_url, source_url, is_verified)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (slug) DO UPDATE SET tool_name=EXCLUDED.tool_name, category=EXCLUDED.category,
          monthly_price=EXCLUDED.monthly_price, has_free_trial=EXCLUDED.has_free_trial, rating=EXCLUDED.rating,
          affiliate_url=EXCLUDED.affiliate_url, logo_url=EXCLUDED.logo_url, source_url=EXCLUDED.source_url,
          is_verified=EXCLUDED.is_verified, updated_at=now()
        RETURNING id, tool_name, slug, category, monthly_price, has_free_trial, rating, affiliate_url, logo_url, source_url, is_verified`,
        [tool.tool_name, tool.slug, tool.category, tool.monthly_price, tool.has_free_trial, tool.rating, tool.affiliate_url, tool.logo_url, tool.source_url, tool.verified]);
      ids.set(tool.slug, saved);
    }
    const comparisons = buildComparisons([...ids.values()]);
    for (const comparison of comparisons) {
      await client.query(`
        INSERT INTO tool_comparisons (primary_tool_id, competitor_tool_id, use_case, slug, key_difference, verdict)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (slug) DO UPDATE SET primary_tool_id=EXCLUDED.primary_tool_id, competitor_tool_id=EXCLUDED.competitor_tool_id,
          use_case=EXCLUDED.use_case, key_difference=EXCLUDED.key_difference, verdict=EXCLUDED.verdict`,
        [ids.get(comparison.primary_tool_slug).id, ids.get(comparison.competitor_tool_slug).id,
          comparison.use_case, comparison.slug, comparison.key_difference, comparison.verdict]);
    }
    await client.query('COMMIT');
    return { tools: ids.size, comparisons: comparisons.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function readCatalog(pool) {
  const { rows: tools } = await pool.query(`SELECT id, tool_name, slug, category, monthly_price, has_free_trial, rating, affiliate_url, logo_url, source_url, is_verified FROM software_tools ORDER BY id`);
  const { rows: comparisons } = await pool.query(`SELECT id, primary_tool_id, competitor_tool_id, use_case, slug, key_difference, verdict FROM tool_comparisons ORDER BY id`);
  return { tools, comparisons };
}

async function createRun(pool, runId) {
  await pool.query(`INSERT INTO seo_generation_runs (run_id, status) VALUES ($1,'running')`, [runId]);
}

async function finishRun(pool, runId, status, generated, rejected, errorMessage = null) {
  await pool.query(`UPDATE seo_generation_runs SET status=$2, pages_generated=$3, pages_rejected=$4, completed_at=now(), error_message=$5 WHERE run_id=$1`, [runId, status, generated, rejected, errorMessage]);
}

async function saveAudit(pool, runId, page, audit) {
  await pool.query(`INSERT INTO seo_page_audits (run_id, page_type, slug, status, errors, content_hash) VALUES ($1,$2,$3,$4,$5,$6)`, [runId, page.page_type, page.slug, audit.errors.length ? 'rejected' : 'published', JSON.stringify(audit.errors), audit.content_hash]);
}

module.exports = { createPool, ensureSchema, seedCatalog, readCatalog, createRun, finishRun, saveAudit };
