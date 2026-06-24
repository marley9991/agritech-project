/**
 * AgriConnect — Backend API
 * Node.js + Express + PostgreSQL + JWT Auth
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ── CORS (allow frontend to call API) ────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/agriconnect',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── JWT helpers (no external library — uses Node crypto) ─────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'agriconnect_dev_secret_2026';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 86400 * 7 }));
  const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64').toString());
    if (payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { full_name, phone_number, password, role, region_id = 1,
            language_pref = 'en', latitude, longitude,
            // role-specific fields
            farm_name, primary_crops, business_name, buyer_type,
            vehicle_type, vehicle_capacity_kg, license_plate, cost_per_km } = req.body;

    if (!full_name || !phone_number || !password || !role)
      return res.status(400).json({ error: 'full_name, phone_number, password and role are required' });
    if (!['farmer','buyer','driver'].includes(role))
      return res.status(400).json({ error: 'role must be farmer, buyer, or driver' });

    const hashed = hashPassword(password);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Ensure regions exist before inserting user
      await client.query(`
        INSERT INTO regions (region_name) VALUES
          ('Greater Accra'),('Volta Region'),('Central Region'),
          ('Eastern Region'),('Western Region')
        ON CONFLICT (region_name) DO NOTHING
      `);
      // Resolve region_id safely — default to Greater Accra (1st region)
      const { rows: [reg] } = await client.query(
        `SELECT region_id FROM regions ORDER BY region_id LIMIT 1`
      );
      const safeRegionId = region_id || (reg ? reg.region_id : null);

      const { rows: [user] } = await client.query(
        `INSERT INTO users (full_name, phone_number, role, region_id, language_pref, latitude, longitude, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING user_id, full_name, phone_number, role, region_id, language_pref`,
        [full_name, phone_number, role, safeRegionId, language_pref, latitude||0, longitude||0, hashed]
      );
      // Role-specific profile
      if (role === 'farmer') {
        await client.query(
          `INSERT INTO farmer_profiles (user_id, farm_name, primary_crops) VALUES ($1,$2,$3)`,
          [user.user_id, farm_name || full_name + "'s Farm", primary_crops || ['tomato']]
        );
      } else if (role === 'buyer') {
        await client.query(
          `INSERT INTO buyer_profiles (user_id, business_name, buyer_type) VALUES ($1,$2,$3)`,
          [user.user_id, business_name || full_name + "'s Business", buyer_type || 'retailer']
        );
      } else if (role === 'driver') {
        await client.query(
          `INSERT INTO driver_profiles (user_id, vehicle_type, vehicle_capacity_kg, license_plate, cost_per_km)
           VALUES ($1,$2,$3,$4,$5)`,
          [user.user_id, vehicle_type || 'pickup_truck', vehicle_capacity_kg || 500,
           license_plate || 'GR-0000-00', cost_per_km || 3.0]
        );
      }
      await client.query('COMMIT');
      const token = signToken({ user_id: user.user_id, role: user.role, full_name: user.full_name });
      res.status(201).json({ success: true, token, user });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.constraint === 'users_phone_number_key')
        return res.status(409).json({ error: 'Phone number already registered' });
      throw err;
    } finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone_number, password } = req.body;
    if (!phone_number || !password)
      return res.status(400).json({ error: 'phone_number and password are required' });
    const hashed = hashPassword(password);
    const { rows: [user] } = await db.query(
      `SELECT u.user_id, u.full_name, u.phone_number, u.role, u.region_id,
              u.avg_rating, u.is_verified, u.latitude, u.longitude,
              fp.farm_name, bp.business_name, dp.vehicle_type, dp.is_available
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.user_id
       LEFT JOIN buyer_profiles  bp ON bp.user_id = u.user_id
       LEFT JOIN driver_profiles dp ON dp.user_id = u.user_id
       WHERE u.phone_number = $1 AND u.password_hash = $2 AND u.is_active = true`,
      [phone_number, hashed]
    );
    if (!user) return res.status(401).json({ error: 'Invalid phone number or password' });
    const token = signToken({ user_id: user.user_id, role: user.role, full_name: user.full_name });
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/me — get current logged-in user profile
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await db.query(
      `SELECT u.*, fp.farm_name, fp.primary_crops, bp.business_name, bp.buyer_type,
              dp.vehicle_type, dp.is_available, dp.cost_per_km, r.region_name
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.user_id
       LEFT JOIN buyer_profiles  bp ON bp.user_id = u.user_id
       LEFT JOIN driver_profiles dp ON dp.user_id = u.user_id
       LEFT JOIN regions r ON r.region_id = u.region_id
       WHERE u.user_id = $1`, [req.user.user_id]
    );
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════

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

// POST /api/products — farmers only
app.post('/api/products', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    const { region_id, crop_category, crop_name, description,
            quantity_available, unit, price_per_unit, latitude, longitude, harvested_at } = req.body;
    const { rows: [product] } = await db.query(
      `INSERT INTO products (farmer_id, region_id, crop_category, crop_name, description,
        quantity_available, unit, price_per_unit, latitude, longitude, harvested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.user_id, region_id||1, crop_category, crop_name, description,
       quantity_available, unit, price_per_unit, latitude||0, longitude||0,
       harvested_at || new Date()]
    );
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════

// POST /api/orders — buyers only
app.post('/api/orders', requireAuth, requireRole('buyer'), async (req, res) => {
  try {
    const { product_id, quantity_ordered,
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
        unit_price_snapshot, total_amount, grand_total, status,
        delivery_address, delivery_latitude, delivery_longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$6,'awaiting_dispatch',$7,$8,$9) RETURNING *`,
      [req.user.user_id, product.farmer_id, product_id, quantity_ordered,
       product.price_per_unit, total_amount,
       delivery_address||'', delivery_latitude||0, delivery_longitude||0]
    );
    await db.query(
      `UPDATE products SET quantity_available = quantity_available - $1 WHERE product_id = $2`,
      [quantity_ordered, product_id]
    );
    res.status(201).json({ success: true, order });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/orders/:orderId', requireAuth, async (req, res) => {
  try {
    const { rows: [order] } = await db.query(
      `SELECT o.*, p.crop_name, p.unit, p.crop_category,
              u_b.full_name AS buyer_name, u_b.phone_number AS buyer_phone,
              u_f.full_name AS farmer_name,
              lt.trip_id, lt.status AS trip_status, lt.driver_id,
              lt.estimated_cost, lt.estimated_duration_minutes, lt.spoilage_score,
              u_d.full_name AS driver_name, u_d.phone_number AS driver_phone
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u_b ON u_b.user_id = o.buyer_id
       JOIN users u_f ON u_f.user_id = o.farmer_id
       LEFT JOIN logistics_trips lt ON lt.order_id = o.order_id
       LEFT JOIN users u_d ON u_d.user_id = lt.driver_id
       WHERE o.order_id = $1`, [req.params.orderId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    // Users can only see their own orders (unless admin)
    if (order.buyer_id !== req.user.user_id && order.farmer_id !== req.user.user_id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my/orders', requireAuth, async (req, res) => {
  try {
    const col = req.user.role === 'farmer' ? 'o.farmer_id' : 'o.buyer_id';
    const { rows } = await db.query(
      `SELECT o.*, p.crop_name, p.unit, p.crop_category,
              u_b.full_name AS buyer_name, u_b.phone_number AS buyer_phone,
              u_f.full_name AS farmer_name
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u_b ON u_b.user_id = o.buyer_id
       JOIN users u_f ON u_f.user_id = o.farmer_id
       WHERE ${col} = $1 ORDER BY o.created_at DESC`,
      [req.user.user_id]
    );
    res.json({ orders: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// SMART DRIVER MATCHING
// ════════════════════════════════════════════════════════════

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2-lat1)*d2r, dLon = (lon2-lon1)*d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function spoilageScore(harvestedAt, category, tempC = 32) {
  const SHELF = { tomato:48, pepper:72, garden_egg:96, okra:36, leafy_greens:18, other:60 };
  const base = SHELF[category] || 60;
  const hours = (Date.now() - new Date(harvestedAt)) / 3_600_000;
  const adjusted = base / Math.pow(2, (tempC-25)/5);
  return Math.min(Math.round((hours/adjusted)*100), 100);
}

app.post('/api/logistics/match-driver', requireAuth, async (req, res) => {
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
       WHERE u.role='driver' AND u.is_active=true AND dp.is_available=true`
    );
    if (!drivers.length) return res.status(404).json({ error: 'No available drivers', spoilage_score: score });
    const maxCost = Math.max(...drivers.map(d => d.cost_per_km));
    const scored = drivers.map(d => {
      const distToPickup = haversineKm(order.pickup_lat, order.pickup_lng, d.latitude, d.longitude);
      const totalDist = distToPickup + haversineKm(order.pickup_lat, order.pickup_lng,
        order.delivery_latitude, order.delivery_longitude);
      const w = isUrgent
        ? {dist:0.60,cost:0.15,cap:0.10,refrig:0.10,rating:0.05}
        : {dist:0.40,cost:0.25,cap:0.20,refrig:0.10,rating:0.05};
      const composite =
        w.dist*(1-Math.min(distToPickup/200,1)) +
        w.cost*(maxCost>0?1-d.cost_per_km/maxCost:1) +
        w.cap*(d.vehicle_capacity_kg>=50?1:0.5) +
        w.refrig*(isUrgent&&d.is_refrigerated?1:0) +
        w.rating*((d.avg_rating||3)/5);
      return { ...d, distance_to_pickup_km:Math.round(distToPickup*10)/10,
        total_route_km:Math.round(totalDist*10)/10,
        estimated_cost:Math.round(d.cost_per_km*totalDist*100)/100,
        estimated_minutes:Math.round((totalDist/40)*60),
        composite_score:Math.round(composite*1000)/1000 };
    }).sort((a,b) => b.composite_score - a.composite_score);
    const best = scored[0];
    const { rows: [trip] } = await db.query(
      `INSERT INTO logistics_trips
         (order_id,driver_id,pickup_latitude,pickup_longitude,
          dropoff_latitude,dropoff_longitude,distance_km,
          estimated_cost,estimated_duration_minutes,spoilage_score,status,matched_at)
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

app.patch('/api/logistics/trips/:tripId/status', requireAuth, async (req, res) => {
  try {
    const { status, latitude, longitude } = req.body;
    await db.query(
      `UPDATE logistics_trips SET status=$1, updated_at=now() WHERE trip_id=$2`,
      [status, req.params.tripId]
    );
    const orderStatus = {picked_up:'in_transit',in_transit:'in_transit',delivered:'delivered',rejected:'awaiting_dispatch'};
    const { rows:[trip] } = await db.query('SELECT order_id FROM logistics_trips WHERE trip_id=$1',[req.params.tripId]);
    if (trip && orderStatus[status])
      await db.query(`UPDATE orders SET status=$1,updated_at=now() WHERE order_id=$2`,[orderStatus[status],trip.order_id]);
    if (status==='delivered') {
      await db.query(`UPDATE orders SET status='completed' WHERE order_id=$1`,[trip.order_id]);
      await db.query(`UPDATE transactions SET escrow_status='released',released_at=now()
                      WHERE order_id=$1 AND escrow_status='held'`,[trip.order_id]);
    }
    if (latitude && longitude)
      await db.query(`INSERT INTO trip_tracking_events (trip_id,latitude,longitude,status_at_event) VALUES ($1,$2,$3,$4)`,
        [req.params.tripId, latitude, longitude, status]);
    res.json({ success:true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// REVIEWS & MESSAGES
// ════════════════════════════════════════════════════════════

app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { order_id, reviewee_id, rating, comment } = req.body;
    const { rows:[review] } = await db.query(
      `INSERT INTO reviews (order_id,reviewer_id,reviewee_id,rating,comment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [order_id, req.user.user_id, reviewee_id, rating, comment]
    );
    await db.query(
      `UPDATE users SET avg_rating=(SELECT ROUND(AVG(rating)::NUMERIC,2) FROM reviews WHERE reviewee_id=$1),
       rating_count=(SELECT COUNT(*) FROM reviews WHERE reviewee_id=$1) WHERE user_id=$1`,
      [reviewee_id]
    );
    res.status(201).json(review);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    const { order_id, recipient_id, message_text } = req.body;
    const { rows:[msg] } = await db.query(
      `INSERT INTO messages (order_id,sender_id,recipient_id,message_text)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [order_id, req.user.user_id, recipient_id, message_text]
    );
    res.status(201).json(msg);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /api/admin/orders — view ALL orders with full details
app.get('/api/admin/orders', async (req, res) => {
  try {
    // Simple secret key check (no login needed for quick admin access)
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== (process.env.ADMIN_KEY || 'agriconnect-admin-2026'))
      return res.status(401).json({ error: 'Invalid admin key' });

    const { rows } = await db.query(
      `SELECT o.order_id, o.status, o.quantity_ordered, o.unit_price_snapshot,
              o.total_amount, o.delivery_fee, o.grand_total, o.created_at,
              p.crop_name, p.crop_category, p.unit,
              u_b.full_name AS buyer_name, u_b.phone_number AS buyer_phone,
              u_f.full_name AS farmer_name, u_f.phone_number AS farmer_phone,
              lt.status AS trip_status, lt.spoilage_score, lt.estimated_cost,
              u_d.full_name AS driver_name, u_d.phone_number AS driver_phone,
              t.escrow_status, t.momo_reference, t.amount AS payment_amount
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u_b ON u_b.user_id = o.buyer_id
       JOIN users u_f ON u_f.user_id = o.farmer_id
       LEFT JOIN logistics_trips lt ON lt.order_id = o.order_id
       LEFT JOIN users u_d ON u_d.user_id = lt.driver_id
       LEFT JOIN transactions t ON t.order_id = o.order_id
       ORDER BY o.created_at DESC`
    );
    res.json({ total: rows.length, orders: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/users — view all registered users
app.get('/api/admin/users', async (req, res) => {
  try {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== (process.env.ADMIN_KEY || 'agriconnect-admin-2026'))
      return res.status(401).json({ error: 'Invalid admin key' });

    const { rows } = await db.query(
      `SELECT u.user_id, u.full_name, u.phone_number, u.role, u.avg_rating,
              u.rating_count, u.is_verified, u.created_at, r.region_name,
              fp.farm_name, bp.business_name, dp.vehicle_type, dp.is_available
       FROM users u
       LEFT JOIN regions r ON r.region_id = u.region_id
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.user_id
       LEFT JOIN buyer_profiles  bp ON bp.user_id = u.user_id
       LEFT JOIN driver_profiles dp ON dp.user_id = u.user_id
       WHERE u.is_active = true
       ORDER BY u.created_at DESC`
    );
    res.json({ total: rows.length, users: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/stats — dashboard numbers at a glance
app.get('/api/admin/stats', async (req, res) => {
  try {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== (process.env.ADMIN_KEY || 'agriconnect-admin-2026'))
      return res.status(401).json({ error: 'Invalid admin key' });

    const [users, orders, products, revenue] = await Promise.all([
      db.query(`SELECT role, COUNT(*) AS count FROM users WHERE is_active=true GROUP BY role`),
      db.query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
      db.query(`SELECT COUNT(*) AS count FROM products WHERE status='active'`),
      db.query(`SELECT COALESCE(SUM(grand_total),0) AS total FROM orders WHERE status IN ('completed','delivered')`),
    ]);

    res.json({
      users: users.rows,
      orders: orders.rows,
      active_products: products.rows[0].count,
      total_revenue_ghs: revenue.rows[0].total,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    // Add password_hash column if it doesn't exist (for existing DBs)
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(64)`);

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
