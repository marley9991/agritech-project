/**
 * AgriConnect Backend — Phase 5
 * Stack: Node.js + Express + PostgreSQL (pg)
 * Task 5.1: Core CRUD API Endpoints
 * Task 5.2: Smart Recommendation & Matching Algorithm
 * Task 5.3: Demo Flow Script (see demo.js)
 */

const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

// ─── Serve the static frontend (index.html) from the same service ──────────
app.use(express.static(__dirname));

// ─── DB pool (configure via env vars) ───────────────────────────────────────
const { Pool } = require('pg');
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/agriconnect',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ─── Health check (used by Docker HEALTHCHECK + Render) ────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Haversine distance (km) between two lat/lng pairs */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK 5.1 — CRUD API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// ── AUTH / USERS ──────────────────────────────────────────────────────────

/**
 * POST /api/users/register
 * Register a new farmer, buyer, or driver.
 * Body: { full_name, phone_number, role, region_id, language_pref, latitude, longitude, ...role_fields }
 */
app.post('/api/users/register', asyncHandler(async (req, res) => {
  const { full_name, phone_number, momo_number, role, region_id,
          language_pref = 'en', latitude, longitude, ...roleFields } = req.body;

  if (!['farmer','buyer','driver'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Insert base user
    const { rows: [user] } = await client.query(
      `INSERT INTO users (full_name, phone_number, momo_number, role, region_id,
                          language_pref, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [full_name, phone_number, momo_number, role, region_id,
       language_pref, latitude, longitude]
    );

    // Insert role-specific profile
    if (role === 'farmer') {
      await client.query(
        `INSERT INTO farmer_profiles (user_id, farm_name, primary_crops, years_farming)
         VALUES ($1,$2,$3,$4)`,
        [user.user_id, roleFields.farm_name,
         roleFields.primary_crops || [], roleFields.years_farming]
      );
    } else if (role === 'buyer') {
      await client.query(
        `INSERT INTO buyer_profiles (user_id, business_name, buyer_type, business_address)
         VALUES ($1,$2,$3,$4)`,
        [user.user_id, roleFields.business_name,
         roleFields.buyer_type, roleFields.business_address]
      );
    } else if (role === 'driver') {
      await client.query(
        `INSERT INTO driver_profiles
           (user_id, vehicle_type, vehicle_capacity_kg, license_plate,
            is_refrigerated, cost_per_km)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [user.user_id, roleFields.vehicle_type, roleFields.vehicle_capacity_kg,
         roleFields.license_plate, roleFields.is_refrigerated || false,
         roleFields.cost_per_km || 2.5]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'users_phone_number_key')
      return res.status(409).json({ error: 'Phone number already registered' });
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/users/:userId
 * Fetch user profile (with role-specific extension).
 */
app.get('/api/users/:userId', asyncHandler(async (req, res) => {
  const { rows: [user] } = await db.query(
    `SELECT u.*, 
       fp.farm_name, fp.primary_crops,
       bp.business_name, bp.buyer_type,
       dp.vehicle_type, dp.is_refrigerated, dp.is_available
     FROM users u
     LEFT JOIN farmer_profiles fp ON fp.user_id = u.user_id
     LEFT JOIN buyer_profiles  bp ON bp.user_id = u.user_id
     LEFT JOIN driver_profiles dp ON dp.user_id = u.user_id
     WHERE u.user_id = $1 AND u.is_active = true`,
    [req.params.userId]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

// ── PRODUCTS / INVENTORY ──────────────────────────────────────────────────

/**
 * POST /api/products
 * Farmer lists a new produce item.
 * Body: { farmer_id, region_id, crop_category, crop_name, quantity_available,
 *          unit, price_per_unit, image_url, latitude, longitude, harvested_at }
 */
app.post('/api/products', asyncHandler(async (req, res) => {
  const {
    farmer_id, region_id, crop_category, crop_name, description,
    quantity_available, unit, price_per_unit, image_url,
    latitude, longitude, harvested_at
  } = req.body;

  const { rows: [product] } = await db.query(
    `INSERT INTO products
       (farmer_id, region_id, crop_category, crop_name, description,
        quantity_available, unit, price_per_unit, image_url,
        latitude, longitude, harvested_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [farmer_id, region_id, crop_category, crop_name, description,
     quantity_available, unit, price_per_unit, image_url,
     latitude, longitude, harvested_at]
  );

  // Log initial stock
  await db.query(
    `INSERT INTO inventory_logs (product_id, change_type, quantity_delta, resulting_quantity)
     VALUES ($1, 'restock', $2, $2)`,
    [product.product_id, quantity_available]
  );

  res.status(201).json({ success: true, product });
}));

/**
 * GET /api/products
 * Marketplace feed — search & filter.
 * Query params: category, region_id, min_price, max_price, min_qty, lat, lng, radius_km (default 50)
 */
app.get('/api/products', asyncHandler(async (req, res) => {
  const {
    category, region_id, min_price, max_price, min_qty,
    lat, lng, radius_km = 50, search, limit = 20, offset = 0
  } = req.query;

  let conditions = [`p.status = 'active'`, `p.quantity_available > 0`];
  let params = [];
  let paramIdx = 1;

  if (category)   { conditions.push(`p.crop_category = $${paramIdx++}`); params.push(category); }
  if (region_id)  { conditions.push(`p.region_id = $${paramIdx++}`);     params.push(region_id); }
  if (min_price)  { conditions.push(`p.price_per_unit >= $${paramIdx++}`); params.push(min_price); }
  if (max_price)  { conditions.push(`p.price_per_unit <= $${paramIdx++}`); params.push(max_price); }
  if (min_qty)    { conditions.push(`p.quantity_available >= $${paramIdx++}`); params.push(min_qty); }
  if (search)     {
    conditions.push(`p.crop_name ILIKE $${paramIdx++}`);
    params.push(`%${search}%`);
  }

  // Geospatial filter: only add if lat/lng provided
  let distanceClause = lat && lng
    ? `, (6371 * acos(cos(radians($${paramIdx++})) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians($${paramIdx++})) +
          sin(radians(${lat})) * sin(radians(p.latitude)))) AS distance_km`
    : '';

  if (lat && lng) {
    params.push(parseFloat(lat), parseFloat(lng));
    conditions.push(
      `(6371 * acos(cos(radians(${lat})) * cos(radians(p.latitude)) *
         cos(radians(p.longitude) - radians(${lng})) +
         sin(radians(${lat})) * sin(radians(p.latitude)))) <= ${radius_km}`
    );
  }

  params.push(parseInt(limit), parseInt(offset));

  const { rows } = await db.query(
    `SELECT p.*, u.full_name AS farmer_name, u.avg_rating AS farmer_rating,
            r.region_name ${distanceClause}
     FROM products p
     JOIN users u ON u.user_id = p.farmer_id
     JOIN regions r ON r.region_id = p.region_id
     WHERE ${conditions.join(' AND ')}
     ${lat && lng ? 'ORDER BY distance_km ASC' : 'ORDER BY p.created_at DESC'}
     LIMIT $${paramIdx - (lat && lng ? 2 : 0) - 1}
     OFFSET $${paramIdx - (lat && lng ? 2 : 0)}`,
    params
  );

  res.json({ products: rows, count: rows.length });
}));

/**
 * GET /api/products/:productId
 * Product detail page.
 */
app.get('/api/products/:productId', asyncHandler(async (req, res) => {
  const { rows: [product] } = await db.query(
    `SELECT p.*, u.full_name AS farmer_name, u.phone_number AS farmer_phone,
            u.avg_rating AS farmer_rating, u.rating_count,
            u.latitude AS farmer_lat, u.longitude AS farmer_lng,
            fp.farm_name, r.region_name
     FROM products p
     JOIN users u ON u.user_id = p.farmer_id
     JOIN regions r ON r.region_id = p.region_id
     LEFT JOIN farmer_profiles fp ON fp.user_id = p.farmer_id
     WHERE p.product_id = $1`,
    [req.params.productId]
  );
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

/**
 * PATCH /api/products/:productId/inventory
 * Farmer updates quantity or marks as sold out.
 * Body: { quantity_available?, status?, note? }
 */
app.patch('/api/products/:productId/inventory', asyncHandler(async (req, res) => {
  const { quantity_available, status, note } = req.body;
  const { productId } = req.params;

  const { rows: [current] } = await db.query(
    'SELECT quantity_available FROM products WHERE product_id = $1', [productId]
  );
  if (!current) return res.status(404).json({ error: 'Product not found' });

  const updates = [];
  const params = [];
  let idx = 1;

  if (quantity_available !== undefined) {
    updates.push(`quantity_available = $${idx++}`);
    params.push(quantity_available);
  }
  if (status) { updates.push(`status = $${idx++}`); params.push(status); }
  updates.push(`updated_at = now()`);

  params.push(productId);
  const { rows: [updated] } = await db.query(
    `UPDATE products SET ${updates.join(',')} WHERE product_id = $${idx} RETURNING *`,
    params
  );

  // Log the inventory change
  if (quantity_available !== undefined) {
    await db.query(
      `INSERT INTO inventory_logs
         (product_id, change_type, quantity_delta, resulting_quantity, note)
       VALUES ($1, 'manual_update', $2, $3, $4)`,
      [productId,
       quantity_available - current.quantity_available,
       quantity_available, note]
    );
  }

  res.json({ success: true, product: updated });
}));

// ── ORDERS ────────────────────────────────────────────────────────────────

/**
 * POST /api/orders
 * Buyer places an order (initiates escrow checkout).
 * Body: { buyer_id, product_id, quantity_ordered, delivery_address, delivery_latitude, delivery_longitude }
 */
app.post('/api/orders', asyncHandler(async (req, res) => {
  const {
    buyer_id, product_id, quantity_ordered,
    delivery_address, delivery_latitude, delivery_longitude
  } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get product + validate stock
    const { rows: [product] } = await client.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active' FOR UPDATE`,
      [product_id]
    );
    if (!product) throw { status: 404, message: 'Product not found or inactive' };
    if (product.quantity_available < quantity_ordered)
      throw { status: 400, message: 'Insufficient stock' };

    const total_amount = product.price_per_unit * quantity_ordered;
    const grand_total  = total_amount; // delivery fee added after driver match

    // Create order
    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (buyer_id, farmer_id, product_id, quantity_ordered,
          unit_price_snapshot, total_amount, grand_total,
          delivery_address, delivery_latitude, delivery_longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [buyer_id, product.farmer_id, product_id, quantity_ordered,
       product.price_per_unit, total_amount, grand_total,
       delivery_address, delivery_latitude, delivery_longitude]
    );

    // Reserve stock (deduct immediately so others can't oversell)
    await client.query(
      `UPDATE products
         SET quantity_available = quantity_available - $1,
             status = CASE WHEN quantity_available - $1 = 0 THEN 'sold_out' ELSE status END
       WHERE product_id = $2`,
      [quantity_ordered, product_id]
    );

    // Log inventory deduction
    await client.query(
      `INSERT INTO inventory_logs
         (product_id, change_type, quantity_delta, resulting_quantity, note)
       VALUES ($1,'sale_deduction',$2,$3,'Reserved for order')`,
      [product_id, -quantity_ordered,
       product.quantity_available - quantity_ordered]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, order });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/orders/:orderId/authorize-payment
 * Records MoMo escrow authorization.
 * Body: { payer_id, momo_reference, amount }
 */
app.post('/api/orders/:orderId/authorize-payment', asyncHandler(async (req, res) => {
  const { payer_id, momo_reference, amount } = req.body;
  const { orderId } = req.params;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      `SELECT * FROM orders WHERE order_id = $1 AND status = 'pending_payment' FOR UPDATE`,
      [orderId]
    );
    if (!order) throw { status: 400, message: 'Order not found or not in pending_payment state' };

    // Create escrow transaction
    await client.query(
      `INSERT INTO transactions
         (order_id, payer_id, payment_method, amount, momo_reference, escrow_status, authorized_at)
       VALUES ($1,$2,'mobile_money',$3,$4,'held',now())`,
      [orderId, payer_id, amount, momo_reference]
    );

    // Advance order to escrow_held → awaiting_dispatch
    await client.query(
      `UPDATE orders SET status = 'awaiting_dispatch', updated_at = now()
       WHERE order_id = $1`,
      [orderId]
    );

    // Notify farmer
    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body, related_order_id)
       VALUES ($1, 'app_push', 'New Order Received! 🎉',
               'A buyer has placed an order and payment is confirmed. Prepare your produce.', $2)`,
      [order.farmer_id, orderId]
    );

    await client.query('COMMIT');
    res.json({ success: true, next_step: 'dispatch' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/orders/:orderId
 * Order detail + trip status combined view.
 */
app.get('/api/orders/:orderId', asyncHandler(async (req, res) => {
  const { rows: [order] } = await db.query(
    `SELECT o.*,
            u_buyer.full_name  AS buyer_name,
            u_farmer.full_name AS farmer_name,
            p.crop_name, p.unit, p.image_url,
            lt.trip_id, lt.status AS trip_status, lt.driver_id,
            lt.estimated_cost, lt.estimated_duration_minutes,
            u_driver.full_name AS driver_name, u_driver.phone_number AS driver_phone,
            dp.vehicle_type
     FROM orders o
     JOIN users u_buyer  ON u_buyer.user_id  = o.buyer_id
     JOIN users u_farmer ON u_farmer.user_id = o.farmer_id
     JOIN products p     ON p.product_id     = o.product_id
     LEFT JOIN logistics_trips lt ON lt.order_id = o.order_id
     LEFT JOIN users u_driver    ON u_driver.user_id = lt.driver_id
     LEFT JOIN driver_profiles dp ON dp.user_id = lt.driver_id
     WHERE o.order_id = $1`,
    [req.params.orderId]
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

/**
 * GET /api/users/:userId/orders
 * Order history for a buyer or farmer.
 */
app.get('/api/users/:userId/orders', asyncHandler(async (req, res) => {
  const { role } = req.query; // 'buyer' or 'farmer'
  const col = role === 'farmer' ? 'o.farmer_id' : 'o.buyer_id';

  const { rows } = await db.query(
    `SELECT o.order_id, o.status, o.grand_total, o.created_at,
            p.crop_name, p.unit, o.quantity_ordered
     FROM orders o
     JOIN products p ON p.product_id = o.product_id
     WHERE ${col} = $1
     ORDER BY o.created_at DESC`,
    [req.params.userId]
  );
  res.json({ orders: rows });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 5.2 — SMART RECOMMENDATION & MATCHING ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeSpoilageScore(harvestedAt, cropCategory, ambientTempC)
 *
 * Returns a 0–100 score representing urgency (higher = must move faster).
 * Based on:
 *   - Hours since harvest (key driver of perishability)
 *   - Crop-specific shelf life at ambient temperature
 *   - Ambient temperature scaling
 */
function computeSpoilageScore(harvestedAt, cropCategory, ambientTempC = 32) {
  // Shelf-life reference (hours at 30°C) per crop — sourced from FAO post-harvest tables
  const SHELF_LIFE_HOURS = {
    tomato:      48,
    pepper:      72,
    garden_egg:  96,
    okra:        36,
    leafy_greens: 18,
    other:       60,
  };

  const baseShelfHours = SHELF_LIFE_HOURS[cropCategory] || 60;
  const hoursSinceHarvest = (Date.now() - new Date(harvestedAt).getTime()) / 3_600_000;

  // Temperature scaling: every 5°C above 25°C halves shelf life
  const tempFactor = Math.pow(2, (ambientTempC - 25) / 5);
  const adjustedShelfHours = baseShelfHours / tempFactor;

  // Fraction of shelf life consumed
  const fractionConsumed = Math.min(hoursSinceHarvest / adjustedShelfHours, 1);
  return Math.round(fractionConsumed * 100);
}

/**
 * POST /api/logistics/match-driver
 * Core matching engine — Task 5.2.
 *
 * Algorithm:
 *  1. Load order + product (pickup coords, crop type, harvest time)
 *  2. Compute spoilage score → sets urgency weight
 *  3. Query all available drivers in the region
 *  4. Score each driver on a weighted composite:
 *       distance_score   (40%) — proximity to pickup point
 *       cost_score       (25%) — lower cost_per_km
 *       capacity_score   (20%) — can carry the cargo weight
 *       refrigerated_bonus (10%) — bonus if crop is high-perishability
 *       rating_score     (5%)  — driver avg_rating
 *  5. Spoilage multiplier: if spoilage_score > 70, up-weight distance 20%
 *  6. Return top 3 candidates; auto-match the #1 and create logistics_trip
 *
 * Body: { order_id, ambient_temp_c? }
 */
app.post('/api/logistics/match-driver', asyncHandler(async (req, res) => {
  const { order_id, ambient_temp_c = 32 } = req.body;

  // 1. Load order + product
  const { rows: [order] } = await db.query(
    `SELECT o.*, p.latitude AS pickup_lat, p.longitude AS pickup_lng,
            p.crop_category, p.harvested_at, p.quantity_available,
            p.crop_name
     FROM orders o
     JOIN products p ON p.product_id = o.product_id
     WHERE o.order_id = $1 AND o.status = 'awaiting_dispatch'`,
    [order_id]
  );
  if (!order) return res.status(400).json({ error: 'Order not found or not awaiting dispatch' });

  // 2. Spoilage Score
  const spoilageScore = computeSpoilageScore(
    order.harvested_at, order.crop_category, ambient_temp_c
  );
  const isHighSpoilage = spoilageScore > 70;

  // 3. Query available drivers (with their current location + profile)
  const { rows: drivers } = await db.query(
    `SELECT u.user_id, u.full_name, u.phone_number, u.latitude, u.longitude,
            u.avg_rating,
            dp.vehicle_type, dp.vehicle_capacity_kg, dp.cost_per_km,
            dp.is_refrigerated
     FROM users u
     JOIN driver_profiles dp ON dp.user_id = u.user_id
     WHERE u.role = 'driver'
       AND u.is_active = true
       AND dp.is_available = true
       AND u.region_id = (SELECT region_id FROM orders o JOIN products p ON p.product_id = o.product_id WHERE o.order_id = $1)`,
    [order_id]
  );

  if (drivers.length === 0)
    return res.status(404).json({ error: 'No available drivers in region', spoilage_score: spoilageScore });

  // 4 & 5. Score each driver
  const ASSUMED_CARGO_KG = 50; // default cargo weight estimate if not in order
  const MAX_COST = Math.max(...drivers.map(d => d.cost_per_km));
  const MAX_DIST = 200; // km normalisation cap

  const scored = drivers.map(driver => {
    const distToPickup = haversineKm(
      parseFloat(order.pickup_lat), parseFloat(order.pickup_lng),
      parseFloat(driver.latitude),  parseFloat(driver.longitude)
    );
    const distPickupToDrop = haversineKm(
      parseFloat(order.pickup_lat),    parseFloat(order.pickup_lng),
      parseFloat(order.delivery_latitude), parseFloat(order.delivery_longitude)
    );
    const totalRouteDist = distToPickup + distPickupToDrop;

    // Normalised scores (0–1, higher is better for the platform)
    const distScore       = 1 - Math.min(distToPickup / MAX_DIST, 1);
    const costScore       = MAX_COST > 0 ? 1 - (driver.cost_per_km / MAX_COST) : 1;
    const capacityScore   = driver.vehicle_capacity_kg >= ASSUMED_CARGO_KG ? 1 : 0.5;
    const ratingScore     = (driver.avg_rating || 3) / 5;
    const refrigBonus     = (isHighSpoilage && driver.is_refrigerated) ? 1 : 0;

    // Weights — shift distance weight if high spoilage
    const w = isHighSpoilage
      ? { dist: 0.60, cost: 0.15, cap: 0.10, rating: 0.05, refrig: 0.10 }
      : { dist: 0.40, cost: 0.25, cap: 0.20, rating: 0.05, refrig: 0.10 };

    const compositeScore =
      w.dist   * distScore   +
      w.cost   * costScore   +
      w.cap    * capacityScore +
      w.rating * ratingScore +
      w.refrig * refrigBonus;

    return {
      ...driver,
      distance_to_pickup_km: Math.round(distToPickup * 10) / 10,
      total_route_km:         Math.round(totalRouteDist * 10) / 10,
      estimated_cost:         Math.round(driver.cost_per_km * totalRouteDist * 100) / 100,
      estimated_minutes:      Math.round((totalRouteDist / 40) * 60), // ~40 km/h avg
      composite_score:        Math.round(compositeScore * 1000) / 1000,
    };
  }).sort((a, b) => b.composite_score - a.composite_score);

  const topDriver   = scored[0];
  const candidateShortlist = scored.slice(0, 3);

  // 6. Auto-create the logistics trip with best match
  const { rows: [trip] } = await db.query(
    `INSERT INTO logistics_trips
       (order_id, driver_id, pickup_latitude, pickup_longitude,
        dropoff_latitude, dropoff_longitude,
        distance_km, estimated_cost, estimated_duration_minutes,
        spoilage_score, status, matched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'matched',now())
     RETURNING *`,
    [order_id, topDriver.user_id,
     order.pickup_lat, order.pickup_lng,
     order.delivery_latitude, order.delivery_longitude,
     topDriver.total_route_km, topDriver.estimated_cost,
     topDriver.estimated_minutes, spoilageScore]
  );

  // Update order status → matched + add delivery fee
  await db.query(
    `UPDATE orders
       SET status = 'matched',
           delivery_fee  = $1,
           grand_total   = total_amount + $1,
           updated_at    = now()
     WHERE order_id = $2`,
    [topDriver.estimated_cost, order_id]
  );

  // Notify driver
  await db.query(
    `INSERT INTO notifications (user_id, channel, title, body, related_order_id)
     VALUES ($1, 'app_push', 'New Delivery Request 🚛',
             $2, $3)`,
    [topDriver.user_id,
     `Pickup: ${order.crop_name} — ${topDriver.distance_to_pickup_km} km away. Estimated fare: GHS ${topDriver.estimated_cost}.`,
     order_id]
  );

  res.json({
    success: true,
    spoilage_score:    spoilageScore,
    is_high_spoilage:  isHighSpoilage,
    matched_driver:    topDriver,
    shortlist:         candidateShortlist,
    trip,
  });
}));

/**
 * PATCH /api/logistics/trips/:tripId/status
 * Driver updates trip status (accept, pick_up, deliver).
 * Body: { status, latitude?, longitude? }
 */
app.patch('/api/logistics/trips/:tripId/status', asyncHandler(async (req, res) => {
  const { status, latitude, longitude } = req.body;
  const { tripId } = req.params;

  const VALID_TRANSITIONS = {
    matched:    ['picked_up', 'rejected'],
    picked_up:  ['in_transit'],
    in_transit: ['delivered'],
  };

  const { rows: [trip] } = await db.query(
    'SELECT * FROM logistics_trips WHERE trip_id = $1', [tripId]
  );
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!VALID_TRANSITIONS[trip.status]?.includes(status))
    return res.status(400).json({
      error: `Cannot transition from '${trip.status}' to '${status}'`
    });

  const tsField = { picked_up: 'picked_up_at', delivered: 'delivered_at' }[status];
  const setClause = tsField
    ? `status=$1, ${tsField}=now(), updated_at=now()`
    : `status=$1, updated_at=now()`;

  await db.query(
    `UPDATE logistics_trips SET ${setClause} WHERE trip_id = $2`,
    [status, tripId]
  );

  // Mirror to order status
  const orderStatusMap = {
    picked_up:  'in_transit',
    in_transit: 'in_transit',
    delivered:  'delivered',
    rejected:   'awaiting_dispatch',
  };
  if (orderStatusMap[status]) {
    await db.query(
      `UPDATE orders SET status=$1, updated_at=now() WHERE order_id=$2`,
      [orderStatusMap[status], trip.order_id]
    );
  }

  // Record tracking ping
  if (latitude && longitude) {
    await db.query(
      `INSERT INTO trip_tracking_events (trip_id, latitude, longitude, status_at_event)
       VALUES ($1,$2,$3,$4)`,
      [tripId, latitude, longitude, status]
    );
  }

  // On delivery → notify buyer + trigger escrow review
  if (status === 'delivered') {
    const { rows: [order] } = await db.query(
      `SELECT buyer_id, farmer_id FROM orders WHERE order_id = $1`, [trip.order_id]
    );
    await db.query(
      `INSERT INTO notifications (user_id, channel, title, body, related_order_id)
       VALUES ($1,'app_push','Your order has arrived! 🥬','Please confirm receipt and rate your experience.',$2),
              ($1,'sms',    'Your AgriConnect order has been delivered. Open the app to confirm receipt.',$2)`,
      [order.buyer_id, trip.order_id]
    );
    // Auto-advance: delivered → completed after 24h would be a cron job;
    // for demo, advance immediately
    await db.query(
      `UPDATE orders SET status='completed', updated_at=now() WHERE order_id=$1`,
      [trip.order_id]
    );
    // Release escrow
    await db.query(
      `UPDATE transactions
         SET escrow_status='released', released_at=now(), payee_id=$1
       WHERE order_id=$2 AND escrow_status='held'`,
      [order.farmer_id, trip.order_id]
    );
  }

  res.json({ success: true, status });
}));

/**
 * GET /api/logistics/trips/:tripId/tracking
 * Live tracking pings for 4.3 Live Order Tracking.
 */
app.get('/api/logistics/trips/:tripId/tracking', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM trip_tracking_events
     WHERE trip_id = $1 ORDER BY recorded_at DESC LIMIT 50`,
    [req.params.tripId]
  );
  res.json({ events: rows });
}));

// ── MESSAGES & REVIEWS ────────────────────────────────────────────────────

/**
 * POST /api/messages
 * Send a message (buyer↔farmer or buyer↔driver).
 */
app.post('/api/messages', asyncHandler(async (req, res) => {
  const { order_id, sender_id, recipient_id, message_text } = req.body;
  const { rows: [msg] } = await db.query(
    `INSERT INTO messages (order_id, sender_id, recipient_id, message_text)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [order_id, sender_id, recipient_id, message_text]
  );
  res.status(201).json(msg);
}));

/**
 * POST /api/reviews
 * Submit post-delivery rating & review.
 */
app.post('/api/reviews', asyncHandler(async (req, res) => {
  const { order_id, reviewer_id, reviewee_id, rating, comment } = req.body;
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });

  const { rows: [review] } = await db.query(
    `INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, comment)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [order_id, reviewer_id, reviewee_id, rating, comment]
  );

  // Update reviewee's denormalized avg_rating
  await db.query(
    `UPDATE users SET
       avg_rating   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE reviewee_id = $1),
       rating_count = (SELECT COUNT(*)                       FROM reviews WHERE reviewee_id = $1)
     WHERE user_id = $1`,
    [reviewee_id]
  );

  res.status(201).json(review);
}));

// ── SPA fallback — serve index.html for any non-API route ──────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── ERROR HANDLER ────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AgriConnect API running on port ${PORT}`));

module.exports = app;
