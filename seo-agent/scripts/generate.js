const { createPool, ensureSchema, seedCatalog } = require('../lib/storage');
const { generateSite } = require('../lib/generator');

(async () => {
  const pool = createPool();
  try {
    await ensureSchema(pool);
    if (process.env.SEO_AUTO_SEED !== 'false') await seedCatalog(pool);
    const result = await generateSite({ pool });
    console.log(JSON.stringify({ success: true, runId: result.runId, total: result.total, generated: result.generated, rejected: result.rejected }));
    if (result.rejected > 0) process.exitCode = 2;
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
