const { createPool, ensureSchema, seedCatalog } = require('../lib/storage');

(async () => {
  const pool = createPool();
  try {
    await ensureSchema(pool);
    const result = await seedCatalog(pool);
    console.log(JSON.stringify({ success: true, ...result }));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
