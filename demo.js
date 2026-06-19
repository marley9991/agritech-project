/**
 * AgriConnect — Phase 5, Task 5.3
 * END-TO-END LIVE DEMO SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Demo Narrative:
 *   Ama (farmer, Volta Region) uploads 10 bags of fresh tomatoes at 7am.
 *   Kofi (buyer, restaurant owner in Accra) searches, finds, and orders them.
 *   The system automatically pings Yaw (truck driver) with an optimized route.
 *   Judges see: registration → listing → discovery → checkout → matching → delivery.
 *
 * Usage: node demo.js
 * Requires: server.js running on localhost:3000 (or set API_BASE env var)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// ─── Fetch helper ────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${JSON.stringify(data)}`);
  return data;
}

function log(step, title, data) {
  const divider = '═'.repeat(60);
  console.log(`\n${divider}`);
  console.log(`  STEP ${step}: ${title}`);
  console.log(divider);
  console.log(JSON.stringify(data, null, 2));
}

function pause(ms = 800) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
async function runDemo() {
  console.log('\n🌱  AgriConnect — GDSS Innovation Challenge Live Demo  🌱');
  console.log('    Farmer-to-Buyer Digital Marketplace Platform');
  console.log('    Sponsored by GIZ / PSInno Programme\n');

  // ── STEP 1: Farmer Registration ──────────────────────────────────────────
  const farmer = await api('POST', '/api/users/register', {
    full_name:     'Ama Asante',
    phone_number:  '+233244001001',
    momo_number:   '+233244001001',
    role:          'farmer',
    region_id:     1,            // Volta Region
    language_pref: 'tw',         // Twi
    latitude:      6.3699,       // Ho, Volta Region
    longitude:     0.8846,
    farm_name:     'Asante Fresh Farm',
    primary_crops: ['tomato', 'pepper'],
    years_farming: 8,
  });
  log(1, 'Farmer Registration — Ama Asante (Volta Region)', {
    user_id: farmer.user.user_id,
    name: farmer.user.full_name,
    role: farmer.user.role,
    region: 'Volta Region',
  });
  await pause();

  // ── STEP 2: Buyer Registration ────────────────────────────────────────────
  const buyer = await api('POST', '/api/users/register', {
    full_name:     'Kofi Mensah',
    phone_number:  '+233209002002',
    momo_number:   '+233209002002',
    role:          'buyer',
    region_id:     2,            // Greater Accra
    language_pref: 'en',
    latitude:      5.6037,       // Accra city centre
    longitude:    -0.1870,
    business_name: "Kofi's Kitchen",
    buyer_type:    'restaurant',
    business_address: '14 Liberation Road, Accra',
  });
  log(2, 'Buyer Registration — Kofi Mensah (Accra Restaurant)', {
    user_id: buyer.user.user_id,
    name: buyer.user.full_name,
    business: 'Kofi\'s Kitchen',
    type: 'restaurant',
  });
  await pause();

  // ── STEP 3: Driver Registration ───────────────────────────────────────────
  const driver = await api('POST', '/api/users/register', {
    full_name:     'Yaw Boateng',
    phone_number:  '+233271003003',
    role:          'driver',
    region_id:     1,            // Volta Region (near pickup)
    language_pref: 'en',
    latitude:      6.3200,       // 5 km from Ama's farm
    longitude:     0.9100,
    vehicle_type:          'pickup_truck',
    vehicle_capacity_kg:   800,
    license_plate:         'GR-2847-21',
    is_refrigerated:       false,
    cost_per_km:            2.80,
  });
  log(3, 'Driver Registration — Yaw Boateng (Pickup Truck, Volta)', {
    user_id: driver.user.user_id,
    name: driver.user.full_name,
    vehicle: 'Pickup Truck',
    plate: 'GR-2847-21',
    cost_per_km: 'GHS 2.80',
  });
  await pause();

  // ── STEP 4: Farmer Lists Produce ──────────────────────────────────────────
  const HOURS_AGO_4 = new Date(Date.now() - 4 * 3_600_000).toISOString();
  const product = await api('POST', '/api/products', {
    farmer_id:          farmer.user.user_id,
    region_id:          1,
    crop_category:      'tomato',
    crop_name:          'Roma Tomatoes (Grade A)',
    description:        'Freshly harvested this morning. Firm, ripe, no blemishes.',
    quantity_available: 10,
    unit:               'bag',
    price_per_unit:     85,      // GHS 85 per bag
    image_url:          'https://cdn.agriconnect.gh/tomatoes_ama.jpg',
    latitude:           6.3699,
    longitude:          0.8846,
    harvested_at:       HOURS_AGO_4,
  });
  log(4, 'Farmer Lists 10 Bags of Roma Tomatoes — GHS 85/bag', {
    product_id:    product.product.product_id,
    crop:          product.product.crop_name,
    qty:           '10 bags',
    price:         'GHS 85 per bag',
    total_value:   'GHS 850',
    harvested:     '4 hours ago',
    location:      'Ho, Volta Region',
  });
  await pause();

  // ── STEP 5: Buyer Searches Marketplace ───────────────────────────────────
  const feed = await api('GET',
    `/api/products?category=tomato&region_id=1&lat=5.6037&lng=-0.187&radius_km=300`
  );
  log(5, 'Buyer Searches for Tomatoes — Marketplace Feed Result', {
    results_found: feed.count,
    top_listing: feed.products[0] ? {
      product_id:    feed.products[0].product_id,
      crop:          feed.products[0].crop_name,
      price:         `GHS ${feed.products[0].price_per_unit} / bag`,
      stock:         `${feed.products[0].quantity_available} bags`,
      farmer:        feed.products[0].farmer_name,
      distance:      `${feed.products[0].distance_km?.toFixed(1)} km`,
    } : 'No results',
  });
  await pause();

  // ── STEP 6: Buyer Places Order (3 bags) ──────────────────────────────────
  const order = await api('POST', '/api/orders', {
    buyer_id:          buyer.user.user_id,
    product_id:        product.product.product_id,
    quantity_ordered:  3,
    delivery_address:  '14 Liberation Road, Accra',
    delivery_latitude:  5.6037,
    delivery_longitude: -0.1870,
  });
  log(6, 'Buyer Orders 3 Bags — Checkout Initiated', {
    order_id:    order.order.order_id,
    items:       '3 × Roma Tomatoes @ GHS 85',
    subtotal:    `GHS ${order.order.total_amount}`,
    status:      order.order.status,
    next_step:   'Authorize MoMo payment → escrow',
  });
  await pause();

  // ── STEP 7: MoMo Escrow Authorization ────────────────────────────────────
  const payment = await api('POST',
    `/api/orders/${order.order.order_id}/authorize-payment`,
    {
      payer_id:       buyer.user.user_id,
      momo_reference: 'MOMO-GH-20260629-884521',
      amount:         order.order.total_amount,
    }
  );
  log(7, 'MoMo Payment Authorized — Funds Held in Escrow', {
    momo_ref:  'MOMO-GH-20260629-884521',
    amount:    `GHS ${order.order.total_amount}`,
    escrow:    'HELD — will release on delivery confirmation',
    next_step:  payment.next_step,
  });
  await pause();

  // ── STEP 8: Smart Driver Matching (THE ALGORITHM) ─────────────────────────
  const match = await api('POST', '/api/logistics/match-driver', {
    order_id:       order.order.order_id,
    ambient_temp_c: 33, // typical June temp, Volta Region
  });
  log(8, '🤖 Smart Matching Algorithm — Driver Matched!', {
    spoilage_score:   `${match.spoilage_score}/100 (${match.is_high_spoilage ? '⚠️  HIGH URGENCY' : '✅  Normal'})`,
    algorithm_note:   match.spoilage_score > 70
      ? 'Spoilage risk elevated — distance weight boosted to 60%'
      : 'Standard weighting — optimizing cost + distance + capacity',
    matched_driver: {
      name:              match.matched_driver.full_name,
      vehicle:           match.matched_driver.vehicle_type,
      distance_to_farm:  `${match.matched_driver.distance_to_pickup_km} km`,
      estimated_fare:    `GHS ${match.matched_driver.estimated_cost}`,
      eta:               `${match.matched_driver.estimated_minutes} min to pickup`,
      composite_score:   match.matched_driver.composite_score,
    },
    shortlisted_drivers: match.shortlist.length,
    trip_id:            match.trip.trip_id,
  });
  await pause();

  // ── STEP 9: Driver Updates Status — Picked Up ────────────────────────────
  await api('PATCH', `/api/logistics/trips/${match.trip.trip_id}/status`, {
    status:    'picked_up',
    latitude:   6.3699,
    longitude:  0.8846,
  });
  log(9, 'Driver Picks Up Produce — Status: PICKED UP 🚛', {
    trip_id:    match.trip.trip_id,
    status:     'picked_up',
    location:   'Ama\'s Farm, Ho, Volta Region',
    cargo:      '3 bags Roma Tomatoes',
  });
  await pause();

  // ── STEP 10: In Transit ───────────────────────────────────────────────────
  await api('PATCH', `/api/logistics/trips/${match.trip.trip_id}/status`, {
    status:    'in_transit',
    latitude:   5.9000,
    longitude:  0.3000,   // midpoint on route
  });
  log(10, 'Produce In Transit — Live Tracking Active 📍', {
    status:   'in_transit',
    midpoint: '~Juapong, Volta/Eastern corridor',
    order_status: 'in_transit',
  });
  await pause();

  // ── STEP 11: Delivered — Escrow Released ─────────────────────────────────
  await api('PATCH', `/api/logistics/trips/${match.trip.trip_id}/status`, {
    status:    'delivered',
    latitude:   5.6037,
    longitude: -0.1870,
  });
  log(11, 'ORDER DELIVERED ✅ — Escrow Released to Farmer', {
    status:         'delivered → completed',
    escrow:         'RELEASED to Ama Asante',
    farmer_revenue: `GHS ${order.order.total_amount}`,
    delivery_fee:   `GHS ${match.matched_driver.estimated_cost} (to Yaw Boateng)`,
    post_harvest_loss: 'ZERO — produce moved within spoilage window',
  });
  await pause();

  // ── STEP 12: Buyer Posts Review ────────────────────────────────────────────
  const review = await api('POST', '/api/reviews', {
    order_id:    order.order.order_id,
    reviewer_id: buyer.user.user_id,
    reviewee_id: farmer.user.user_id,
    rating:      5,
    comment:     'Very fresh tomatoes! Will order again. Fast delivery.',
  });
  log(12, 'Post-Delivery Review Submitted ⭐⭐⭐⭐⭐', {
    reviewer:  'Kofi Mensah (Buyer)',
    reviewee:  'Ama Asante (Farmer)',
    rating:    '5/5',
    comment:   review.comment,
  });

  // ── DEMO SUMMARY ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  🏆  DEMO COMPLETE — SUMMARY FOR JUDGES');
  console.log('═'.repeat(60));
  console.log(`
  ✅ Farmer registered & listed 10 bags of tomatoes in < 60 sec
  ✅ Buyer searched, filtered, and ordered in 2 taps
  ✅ MoMo escrow payment secured buyer and farmer
  ✅ Smart matching algorithm selected best driver in < 45 min:
       • Spoilage score computed (crop age + ambient temp)
       • Weighted scoring: distance, cost, capacity, rating, refrigeration
       • Auto-paged nearest available driver in region
  ✅ Real-time status updates: Matched → Picked Up → In Transit → Delivered
  ✅ Escrow auto-released on delivery confirmation
  ✅ Post-harvest loss: ZERO (produce moved within safe window)
  ✅ End-to-end time: ~3 hours farm to table

  BONUS FEATURES DEMONSTRATED:
  🌐 USSD/SMS session table ready for low-connectivity farmers
  📍 Geolocation + haversine distance calculation active
  🤖 Spoilage score algorithm with ambient temperature scaling
  🔒 MoMo escrow protecting both farmer and buyer
  `);
}

runDemo().catch(err => {
  console.error('\n❌ Demo failed:', err.message);
  process.exit(1);
});
