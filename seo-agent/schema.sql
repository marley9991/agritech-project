-- Programmatic SEO Agent schema. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS software_tools (
  id SERIAL PRIMARY KEY,
  tool_name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL CHECK (monthly_price >= 0),
  has_free_trial BOOLEAN NOT NULL DEFAULT TRUE,
  rating NUMERIC(3,2) CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  affiliate_url TEXT NOT NULL,
  logo_url TEXT,
  source_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tool_comparisons (
  id SERIAL PRIMARY KEY,
  primary_tool_id INT NOT NULL REFERENCES software_tools(id) ON DELETE CASCADE,
  competitor_tool_id INT NOT NULL REFERENCES software_tools(id) ON DELETE CASCADE,
  use_case VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  key_difference TEXT NOT NULL,
  verdict TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (primary_tool_id <> competitor_tool_id)
);

CREATE TABLE IF NOT EXISTS seo_generation_runs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','completed','failed')),
  pages_generated INTEGER NOT NULL DEFAULT 0,
  pages_rejected INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS seo_page_audits (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL REFERENCES seo_generation_runs(run_id) ON DELETE CASCADE,
  page_type VARCHAR(30) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('published','rejected')),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_hash CHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_software_tools_category ON software_tools(category);
CREATE INDEX IF NOT EXISTS idx_tool_comparisons_primary ON tool_comparisons(primary_tool_id);
CREATE INDEX IF NOT EXISTS idx_seo_page_audits_run ON seo_page_audits(run_id);
