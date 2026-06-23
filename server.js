/**
 * AgriConnect — Backend API
 * Node.js + Express + PostgreSQL
 * Auto-initializes DB schema + seed data on first boot
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/agriconnect',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────
app.post('/api/users/register', async (req, res) => {
  try {
    const { full_name, phone_number, momo_number, role, region_id,
            language_pref = 'en', latitude, longitude } = req.body;
    const { rows: [user] } = await db.query(
      `INSERT INTO users (full_name, phone_number, momo_number, role, region_id,
                          language_pref, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [full_name, phone_number, momo_number, role, region_id,
       language_pref, latitude, longitude]
    );
    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const { rows: [user] } = await db.query(
      `SELECT u.*, fp.farm_name, bp.business_name, dp.vehicle_type, dp.is_available
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.user_id
       LEFT JOIN buyer_profiles  bp ON bp.user_id = u.user_id
       LEFT JOIN driver_profiles dp ON dp.user_id = u.user_id
       WHERE u.user_id = $1`, [req.params.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Products ──────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, region_id, search, limit = 20, offset = 0 } = req.query;
    let conditions = [`p.status = 'active'`, `p.quantity_available > 0`];
    let params = [];
    let i = 1;
    if (category)  { conditions.push(`p.crop_category = $${i++}`); params.push(category); }
    if (region_id) { conditions.push(`p.region_id = $${i++}`);     params.push(region_id); }
    if (search)    { conditions.push(`p.crop_name ILIKE $${i++}`); params.push(`%${search}%`); }
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS farmer_name, u.avg_rating AS farmer_rating, r.region_name
       FROM products p
       JOIN users u ON u.user_id = p.farmer_id
       JOIN regions r ON r.region_id = p.region_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i+1}`, params
    );
    res.json({ products: rows, count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:productId', async (req, res) => {
  try {
    const { rows: [p] } = await db.query(
      `SELECT p.*, u.full_name AS farmer_name, u.phone_number AS farmer_phone,
              u.avg_rating, r.region_name, fp.farm_name
       FROM products p
       JOIN users u ON u.user_id = p.farmer_id
       JOIN regions r ON r.region_id = p.region_id
       LEFT JOIN farmer_profiles fp ON fp.user_id = p.farmer_id
       WHERE p.product_id = $1`, [req.params.productId]
    );
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const { farmer_id, region_id, crop_category, crop_name, description,
            quantity_available, unit, price_per_unit, latitude, longitude, harvested_at } = req.body;
    const { rows: [product] } = await db.query(
      `INSERT INTO products (farmer_id, region_id, crop_category, crop_name, description,
        quantity_available, unit, price_per_unit, latitude, longitude, harvested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [farmer_id, region_id, crop_category, crop_name, description,
       quantity_available, unit, price_per_unit, latitude, longitude, harvested_at]
    );
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Orders ────────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    const { buyer_id, product_id, quantity_ordered,
            delivery_address, delivery_latitude, delivery_longitude } = req.body;
    const { rows: [product] } = await db.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active'`, [product_id]
    );
    if (!product) return res.status(404).json({ error: 'Product not found or inactive' });
    if (product.quantity_available < quantity_ordered)
      return res.status(400).json({ error: 'Insufficient stock' });
    const total_amount = product.price_per_unit * quantity_ordered;
    const { rows: [order] } = await db.query(
      `INSERT INTO orders (buyer_id, farmer_id, product_id, quantity_ordered,
        unit_price_snapshot, total_amount, grand_total,
        delivery_address, delivery_latitude, delivery_longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9) RETURNING *`,
      [buyer_id, product.farmer_id, product_id, quantity_ordered,
       product.price_per_unit, total_amount,
       delivery_address, delivery_latitude, delivery_longitude]
    );
    await db.query(
      `UPDATE products SET quantity_available = quantity_available - $1 WHERE product_id = $2`,
      [quantity_ordered, product_id]
    );
    res.status(201).json({ success: true, order });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { rows: [order] } = await db.query(
      `SELECT o.*, p.crop_name, p.unit, u_b.full_name AS buyer_name,
              u_f.full_name AS farmer_name
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u_b ON u_b.user_id = o.buyer_id
       JOIN users u_f ON u_f.user_id = o.farmer_id
       WHERE o.order_id = $1`, [req.params.orderId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:userId/orders', async (req, res) => {
  try {
    const col = req.query.role === 'farmer' ? 'o.farmer_id' : 'o.buyer_id';
    const { rows } = await db.query(
      `SELECT o.*, p.crop_name FROM orders o
       JOIN products p ON p.product_id = o.product_id
       WHERE ${col} = $1 ORDER BY o.created_at DESC`,
      [req.params.userId]
    );
    res.json({ orders: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Smart Driver Matching ─────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*d2r) * Math.cos(lat2*d2r) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function spoilageScore(harvestedAt, category, tempC = 32) {
  const SHELF = { tomato:48, pepper:72, garden_egg:96, okra:36, leafy_greens:18, other:60 };
  const base = SHELF[category] || 60;
  const hours = (Date.now() - new Date(harvestedAt)) / 3_600_000;
  const adjusted = base / Math.pow(2, (tempC - 25) / 5);
  return Math.min(Math.round((hours / adjusted) * 100), 100);
}

app.post('/api/logistics/match-driver', async (req, res) => {
  try {
    const { order_id, ambient_temp_c = 32 } = req.body;
    const { rows: [order] } = await db.query(
      `SELECT o.*, p.latitude AS pickup_lat, p.longitude AS pickup_lng,
              p.crop_category, p.harvested_at, p.crop_name
       FROM orders o JOIN products p ON p.product_id = o.product_id
       WHERE o.order_id = $1`, [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const score = spoilageScore(order.harvested_at, order.crop_category, ambient_temp_c);
    const isUrgent = score > 70;

    const { rows: drivers } = await db.query(
      `SELECT u.*, dp.vehicle_type, dp.vehicle_capacity_kg, dp.cost_per_km, dp.is_refrigerated
       FROM users u JOIN driver_profiles dp ON dp.user_id = u.user_id
       WHERE u.role = 'driver' AND u.is_active = true AND dp.is_available = true`
    );
    if (!drivers.length) return res.status(404).json({ error: 'No available drivers', spoilage_score: score });

    const maxCost = Math.max(...drivers.map(d => d.cost_per_km));
    const scored = drivers.map(d => {
      const distToPickup = haversineKm(order.pickup_lat, order.pickup_lng, d.latitude, d.longitude);
      const totalDist = distToPickup + haversineKm(order.pickup_lat, order.pickup_lng,
        order.delivery_latitude, order.delivery_longitude);
      const w = isUrgent
        ? { dist:0.60, cost:0.15, cap:0.10, refrig:0.10, rating:0.05 }
        : { dist:0.40, cost:0.25, cap:0.20, refrig:0.10, rating:0.05 };
      const composite =
        w.dist   * (1 - Math.min(distToPickup / 200, 1)) +
        w.cost   * (maxCost > 0 ? 1 - d.cost_per_km / maxCost : 1) +
        w.cap    * (d.vehicle_capacity_kg >= 50 ? 1 : 0.5) +
        w.refrig * (isUrgent && d.is_refrigerated ? 1 : 0) +
        w.rating * ((d.avg_rating || 3) / 5);
      return { ...d, distance_to_pickup_km: Math.round(distToPickup*10)/10,
        total_route_km: Math.round(totalDist*10)/10,
        estimated_cost: Math.round(d.cost_per_km * totalDist * 100) / 100,
        estimated_minutes: Math.round((totalDist / 40) * 60),
        composite_score: Math.round(composite * 1000) / 1000 };
    }).sort((a, b) => b.composite_score - a.composite_score);

    const best = scored[0];
    const { rows: [trip] } = await db.query(
      `INSERT INTO logistics_trips
         (order_id, driver_id, pickup_latitude, pickup_longitude,
          dropoff_latitude, dropoff_longitude, distance_km,
          estimated_cost, estimated_duration_minutes, spoilage_score, status, matched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'matched',now()) RETURNING *`,
      [order_id, best.user_id, order.pickup_lat, order.pickup_lng,
       order.delivery_latitude, order.delivery_longitude,
       best.total_route_km, best.estimated_cost, best.estimated_minutes, score]
    );
    await db.query(
      `UPDATE orders SET status='matched', delivery_fee=$1, grand_total=total_amount+$1 WHERE order_id=$2`,
      [best.estimated_cost, order_id]
    );
    res.json({ success:true, spoilage_score:score, is_high_spoilage:isUrgent,
               matched_driver:best, shortlist:scored.slice(0,3), trip });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/logistics/trips/:tripId/status', async (req, res) => {
  try {
    const { status, latitude, longitude } = req.body;
    await db.query(
      `UPDATE logistics_trips SET status=$1, updated_at=now() WHERE trip_id=$2`,
      [status, req.params.tripId]
    );
    const orderStatus = { picked_up:'in_transit', in_transit:'in_transit', delivered:'delivered', rejected:'awaiting_dispatch' };
    const { rows: [trip] } = await db.query('SELECT order_id FROM logistics_trips WHERE trip_id=$1', [req.params.tripId]);
    if (trip && orderStatus[status]) {
      await db.query(`UPDATE orders SET status=$1, updated_at=now() WHERE order_id=$2`,
        [orderStatus[status], trip.order_id]);
    }
    if (status === 'delivered') {
      await db.query(`UPDATE orders SET status='completed' WHERE order_id=$1`, [trip.order_id]);
      await db.query(`UPDATE transactions SET escrow_status='released', released_at=now()
                      WHERE order_id=$1 AND escrow_status='held'`, [trip.order_id]);
    }
    if (latitude && longitude) {
      await db.query(
        `INSERT INTO trip_tracking_events (trip_id, latitude, longitude, status_at_event)
         VALUES ($1,$2,$3,$4)`, [req.params.tripId, latitude, longitude, status]
      );
    }
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reviews ───────────────────────────────────────────────────────────────────
app.post('/api/reviews', async (req, res) => {
  try {
    const { order_id, reviewer_id, reviewee_id, rating, comment } = req.body;
    const { rows: [review] } = await db.query(
      `INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [order_id, reviewer_id, reviewee_id, rating, comment]
    );
    await db.query(
      `UPDATE users SET avg_rating=(SELECT ROUND(AVG(rating)::NUMERIC,2) FROM reviews WHERE reviewee_id=$1),
       rating_count=(SELECT COUNT(*) FROM reviews WHERE reviewee_id=$1) WHERE user_id=$1`,
      [reviewee_id]
    );
    res.status(201).json(review);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Auto-init DB on first boot ────────────────────────────────────────────────
async function initDB() {
  try {
    const { rows } = await db.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables
       WHERE table_schema='public' AND table_name='users') AS exists`
    );
    if (rows[0].exists) {
      console.log('✓ Schema already exists — skipping init.');
      return;
    }
    console.log('⚙ First boot — running schema...');
    await db.query(fs.readFileSync(path.join(__dirname, 'agriconnect_schema.sql'), 'utf8'));
    console.log('✓ Schema created.');
    const seedPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      await db.query(fs.readFileSync(seedPath, 'utf8'));
      console.log('✓ Seed data loaded.');
    }
  } catch (err) {
    console.error('✗ DB init error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
initDB().finally(() => {
  app.listen(PORT, () => console.log(`AgriConnect API running on port ${PORT}`));
});

module.exports = app;
