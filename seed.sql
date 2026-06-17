-- ─────────────────────────────────────────────────────────────────────────────
-- AgriConnect — Demo Seed Data
-- Populates the database with realistic test data for judges
-- Run: psql $DATABASE_URL -f seed.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Regions
INSERT INTO regions (region_name) VALUES
  ('Volta Region'),
  ('Greater Accra'),
  ('Central Region'),
  ('Eastern Region'),
  ('Western Region')
ON CONFLICT DO NOTHING;

-- Users: Farmers
INSERT INTO users (full_name, phone_number, momo_number, role, region_id,
                   language_pref, latitude, longitude, is_verified)
VALUES
  ('Ama Asante',      '+233244001001', '+233244001001', 'farmer', 1, 'tw',  6.3699,  0.8846, true),
  ('Kojo Aidoo',      '+233244002002', '+233244002002', 'farmer', 1, 'en',  5.9008,  0.8321, true),
  ('Efua Boateng',    '+233244003003', '+233244003003', 'farmer', 1, 'ga',  6.0789,  0.7943, false),
  ('Abena Mensah',    '+233244004004', '+233244004004', 'farmer', 1, 'tw',  6.4102,  0.8512, true),
  ('Kwame Darko',     '+233244005005', '+233244005005', 'farmer', 1, 'en',  5.8812,  0.9012, false),
  ('Yaa Amponsah',    '+233244006006', '+233244006006', 'farmer', 3, 'en',  5.1053, -1.2466, true)
ON CONFLICT DO NOTHING;

-- Users: Buyers
INSERT INTO users (full_name, phone_number, momo_number, role, region_id,
                   language_pref, latitude, longitude, is_verified)
VALUES
  ('Kofi Mensah',     '+233209002002', '+233209002002', 'buyer', 2, 'en',  5.6037, -0.1870, true),
  ('Akua Boateng',    '+233209003003', '+233209003003', 'buyer', 2, 'en',  5.5713, -0.2210, true),
  ('Kweku Asamoah',   '+233209004004', '+233209004004', 'buyer', 2, 'ga',  5.6302, -0.1612, false)
ON CONFLICT DO NOTHING;

-- Users: Drivers
INSERT INTO users (full_name, phone_number, role, region_id,
                   language_pref, latitude, longitude, is_verified, avg_rating, rating_count)
VALUES
  ('Yaw Boateng',     '+233271003003', 'driver', 1, 'en',  6.3200,  0.9100, true,  4.6, 89),
  ('Kweku Asare',     '+233271004004', 'driver', 1, 'en',  6.1500,  0.8600, true,  4.1, 54),
  ('Esi Amoah',       '+233271005005', 'driver', 1, 'tw',  5.9200,  0.9400, false, 4.8, 32)
ON CONFLICT DO NOTHING;

-- Farmer profiles
INSERT INTO farmer_profiles (user_id, farm_name, primary_crops, years_farming)
SELECT u.user_id, d.farm_name, d.crops, d.years
FROM users u
JOIN (VALUES
  ('+233244001001', 'Asante Fresh Farm',   ARRAY['tomato','pepper']::crop_category[],    8),
  ('+233244002002', 'Aidoo Agro Fields',   ARRAY['pepper']::crop_category[],             5),
  ('+233244003003', 'Boateng Greens Co.',  ARRAY['leafy_greens','okra']::crop_category[], 3),
  ('+233244004004', 'Mensah Garden Farm',  ARRAY['garden_egg']::crop_category[],          6),
  ('+233244005005', 'Darko Okra Plots',    ARRAY['okra']::crop_category[],               4),
  ('+233244006006', 'Amponsah Pepper Hub', ARRAY['pepper']::crop_category[],             11)
) AS d(phone, farm_name, crops, years) ON u.phone_number = d.phone
ON CONFLICT DO NOTHING;

-- Buyer profiles
INSERT INTO buyer_profiles (user_id, business_name, buyer_type)
SELECT u.user_id, d.biz, d.type
FROM users u
JOIN (VALUES
  ('+233209002002', "Kofi's Kitchen",    'restaurant'),
  ('+233209003003', 'Akua Retail Store', 'retailer'),
  ('+233209004004', 'Kweku Food Export', 'exporter')
) AS d(phone, biz, type) ON u.phone_number = d.phone
ON CONFLICT DO NOTHING;

-- Driver profiles
INSERT INTO driver_profiles (user_id, vehicle_type, vehicle_capacity_kg,
                              license_plate, is_refrigerated, is_available, cost_per_km)
SELECT u.user_id, d.vtype, d.cap, d.plate, d.refrig, true, d.rate
FROM users u
JOIN (VALUES
  ('+233271003003', 'pickup_truck', 800,  'GR-2847-21', false, 2.80),
  ('+233271004004', 'box_truck',    2000, 'GE-1193-20', false, 3.20),
  ('+233271005005', 'tricycle',     250,  'VR-0042-22', false, 4.50)
) AS d(phone, vtype, cap, plate, refrig, rate) ON u.phone_number = d.phone
ON CONFLICT DO NOTHING;

-- Products (harvested ~4 hours ago for realistic spoilage scores)
INSERT INTO products (farmer_id, region_id, crop_category, crop_name, description,
                      quantity_available, unit, price_per_unit, latitude, longitude,
                      harvested_at, status)
SELECT u.user_id, 1, d.cat, d.name, d.desc,
       d.qty, d.unit::unit_type, d.price, d.lat, d.lng,
       NOW() - d.hrs * INTERVAL '1 hour', 'active'
FROM users u
JOIN (VALUES
  ('+233244001001', 'tomato',      'Roma Tomatoes (Grade A)',    'Freshly harvested. Firm, ripe, no blemishes.',  10, 'bag',    85,  6.3699, 0.8846, 4),
  ('+233244002002', 'pepper',      'Scotch Bonnet Peppers',      'Bright orange/red. High heat variety.',          5, 'crate',  60,  5.9008, 0.8321, 8),
  ('+233244003003', 'leafy_greens','Kontomire (Cocoyam Leaves)', 'Tender young leaves, ideal for soups.',          8, 'basket', 25,  6.0789, 0.7943, 2),
  ('+233244004004', 'garden_egg',  'Garden Eggs (Round)',        'Locally grown, firm texture.',                   8, 'bag',    45,  6.4102, 0.8512, 6),
  ('+233244005005', 'okra',        'Fresh Okra',                 'Hand-picked, uniform size, no wilting.',        15, 'bag',    35,  5.8812, 0.9012, 10),
  ('+233244006006', 'pepper',      'Jalapeño Peppers',           'Medium heat. Export grade quality.',             6, 'crate',  75,  5.1053, -1.2466, 3)
) AS d(phone, cat, name, desc, qty, unit, price, lat, lng, hrs)
  ON u.phone_number = d.phone
ON CONFLICT DO NOTHING;

-- Sample completed order (for history / reviews demonstration)
DO $$
DECLARE
  v_buyer_id   INT;
  v_farmer_id  INT;
  v_product_id INT;
  v_driver_id  INT;
  v_order_id   INT;
  v_trip_id    INT;
BEGIN
  SELECT user_id INTO v_buyer_id  FROM users WHERE phone_number = '+233209002002';
  SELECT user_id INTO v_farmer_id FROM users WHERE phone_number = '+233244003003';
  SELECT user_id INTO v_driver_id FROM users WHERE phone_number = '+233271004004';
  SELECT product_id INTO v_product_id FROM products WHERE crop_category = 'leafy_greens' LIMIT 1;

  INSERT INTO orders (buyer_id, farmer_id, product_id, quantity_ordered,
                      unit_price_snapshot, total_amount, delivery_fee, grand_total,
                      status, delivery_address, delivery_latitude, delivery_longitude)
  VALUES (v_buyer_id, v_farmer_id, v_product_id, 5,
          25, 125, 310, 435,
          'completed', '14 Liberation Road, Accra', 5.6037, -0.1870)
  RETURNING order_id INTO v_order_id;

  INSERT INTO transactions (order_id, payer_id, payment_method, amount,
                             momo_reference, escrow_status, authorized_at, released_at)
  VALUES (v_order_id, v_buyer_id, 'mobile_money', 125,
          'MOMO-GH-20260614-001122', 'released', NOW() - INTERVAL '48 hours', NOW() - INTERVAL '44 hours');

  INSERT INTO logistics_trips (order_id, driver_id, pickup_latitude, pickup_longitude,
                                dropoff_latitude, dropoff_longitude, distance_km,
                                estimated_cost, estimated_duration_minutes, spoilage_score,
                                status, matched_at, picked_up_at, delivered_at)
  VALUES (v_order_id, v_driver_id, 6.0789, 0.7943, 5.6037, -0.1870,
          155, 310, 232, 42, 'delivered',
          NOW() - INTERVAL '47 hours', NOW() - INTERVAL '46 hours', NOW() - INTERVAL '44 hours');

  -- Post-delivery review
  INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, comment)
  VALUES
    (v_order_id, v_buyer_id, v_farmer_id, 5, 'Very fresh kontomire! Will order again.'),
    (v_order_id, v_buyer_id, v_driver_id, 4, 'Good delivery, slight delay but communicated well.');

  -- Update ratings
  UPDATE users SET avg_rating=4.5, rating_count=rating_count+1 WHERE user_id=v_farmer_id;
  UPDATE users SET avg_rating=4.1, rating_count=rating_count+1 WHERE user_id=v_driver_id;
END $$;

-- In-transit order (the live demo order)
DO $$
DECLARE
  v_buyer_id   INT;
  v_farmer_id  INT;
  v_product_id INT;
  v_driver_id  INT;
  v_order_id   INT;
BEGIN
  SELECT user_id INTO v_buyer_id  FROM users WHERE phone_number = '+233209002002';
  SELECT user_id INTO v_farmer_id FROM users WHERE phone_number = '+233244001001';
  SELECT user_id INTO v_driver_id FROM users WHERE phone_number = '+233271003003';
  SELECT product_id INTO v_product_id FROM products WHERE crop_category = 'tomato' LIMIT 1;

  INSERT INTO orders (buyer_id, farmer_id, product_id, quantity_ordered,
                      unit_price_snapshot, total_amount, delivery_fee, grand_total,
                      status, delivery_address, delivery_latitude, delivery_longitude)
  VALUES (v_buyer_id, v_farmer_id, v_product_id, 3,
          85, 255, 472, 727,
          'in_transit', '14 Liberation Road, Accra', 5.6037, -0.1870)
  RETURNING order_id INTO v_order_id;

  INSERT INTO transactions (order_id, payer_id, payment_method, amount,
                             momo_reference, escrow_status, authorized_at)
  VALUES (v_order_id, v_buyer_id, 'mobile_money', 255,
          'MOMO-GH-20260629-884521', 'held', NOW() - INTERVAL '2 hours');

  INSERT INTO logistics_trips (order_id, driver_id, pickup_latitude, pickup_longitude,
                                dropoff_latitude, dropoff_longitude, distance_km,
                                estimated_cost, estimated_duration_minutes, spoilage_score,
                                status, matched_at, picked_up_at)
  VALUES (v_order_id, v_driver_id, 6.3699, 0.8846, 5.6037, -0.1870,
          168.4, 472, 253, 65, 'in_transit',
          NOW() - INTERVAL '90 minutes', NOW() - INTERVAL '60 minutes');

  -- Live tracking pings
  INSERT INTO trip_tracking_events (trip_id, latitude, longitude, status_at_event)
  SELECT lt.trip_id, lat, lng, 'in_transit'::trip_status
  FROM logistics_trips lt
  WHERE lt.order_id = v_order_id,
  (VALUES (6.3699,0.8846),(6.3200,0.9000),(6.2100,0.7800),(6.0500,0.5200),(5.9000,0.3000)) AS pts(lat,lng);
END $$;

SELECT 'Seed data loaded successfully.' AS status;
SELECT role, COUNT(*) AS count FROM users GROUP BY role;
SELECT crop_category, crop_name, price_per_unit, quantity_available FROM products;
