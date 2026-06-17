-- =====================================================================
-- AgriConnect: AgriTech Farmer-to-Buyer Digital Marketplace
-- Relational Database Schema (PostgreSQL dialect)
-- Phase 4, Task 4.2
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('farmer', 'buyer', 'driver');

CREATE TYPE language_pref AS ENUM ('en', 'ga', 'tw'); -- English, Ga, Twi

CREATE TYPE crop_category AS ENUM (
    'tomato', 'pepper', 'garden_egg', 'okra', 'leafy_greens', 'other'
);

CREATE TYPE unit_type AS ENUM ('bag', 'crate', 'basket', 'kg', 'box');

CREATE TYPE listing_status AS ENUM ('active', 'low_stock', 'sold_out', 'inactive');

CREATE TYPE order_status AS ENUM (
    'pending_payment',   -- buyer initiated checkout, awaiting MoMo confirmation
    'escrow_held',        -- payment authorized, held in escrow
    'awaiting_dispatch',  -- payment confirmed, awaiting driver match
    'matched',            -- driver matched/assigned
    'in_transit',         -- picked up, en route
    'delivered',          -- delivered to buyer
    'completed',          -- escrow released, transaction closed
    'cancelled',          -- cancelled before fulfillment
    'disputed'            -- flagged for resolution
);

CREATE TYPE trip_status AS ENUM (
    'requested',   -- delivery request created, searching for driver
    'matched',     -- driver accepted
    'rejected',    -- driver rejected (returns to pool)
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled'
);

CREATE TYPE payment_method AS ENUM ('mobile_money', 'cash_on_delivery', 'bank_transfer');

CREATE TYPE notification_channel AS ENUM ('app_push', 'sms', 'ussd');


-- ---------------------------------------------------------------------
-- 1. USERS & REGIONS
-- ---------------------------------------------------------------------

-- Supported supply-corridor regions (Greater Accra, Central, Volta, etc.)
CREATE TABLE regions (
    region_id       SERIAL PRIMARY KEY,
    region_name     VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'Greater Accra', 'Central', 'Volta'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Core user table for all three roles
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    full_name       VARCHAR(120) NOT NULL,
    phone_number    VARCHAR(20) NOT NULL UNIQUE,    -- also MoMo number
    momo_number     VARCHAR(20),                    -- if different from phone
    role            user_role NOT NULL,
    region_id       INTEGER REFERENCES regions(region_id),
    language_pref   language_pref NOT NULL DEFAULT 'en',
    is_ussd_user    BOOLEAN NOT NULL DEFAULT FALSE,  -- registered via USSD/SMS channel
    profile_image_url VARCHAR(255),
    latitude        NUMERIC(9,6),                   -- last known/registered location
    longitude       NUMERIC(9,6),
    avg_rating      NUMERIC(3,2) DEFAULT 0.00,       -- denormalized, recalculated from reviews
    rating_count    INTEGER DEFAULT 0,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_region ON users(region_id);
CREATE INDEX idx_users_phone ON users(phone_number);

-- Role-specific extension: Farmer profile
CREATE TABLE farmer_profiles (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    farm_name       VARCHAR(120),
    farm_size_acres NUMERIC(6,2),
    primary_crops   crop_category[],                -- array of crops typically grown
    years_farming   INTEGER
);

-- Role-specific extension: Buyer profile
CREATE TABLE buyer_profiles (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    business_name   VARCHAR(120),
    buyer_type      VARCHAR(50),     -- 'retailer', 'restaurant', 'processor', 'exporter', 'household'
    business_address VARCHAR(255)
);

-- Role-specific extension: Driver (logistics provider) profile
CREATE TABLE driver_profiles (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    vehicle_type    VARCHAR(50),     -- 'tricycle', 'pickup_truck', 'box_truck', etc.
    vehicle_capacity_kg NUMERIC(8,2),
    license_plate   VARCHAR(20),
    is_refrigerated BOOLEAN NOT NULL DEFAULT FALSE,
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,   -- toggled by driver for dispatch matching
    cost_per_km     NUMERIC(8,2)     -- base rate used in transport cost estimates
);


-- ---------------------------------------------------------------------
-- 2. PRODUCTS / INVENTORY
-- ---------------------------------------------------------------------

CREATE TABLE products (
    product_id      SERIAL PRIMARY KEY,
    farmer_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    region_id       INTEGER NOT NULL REFERENCES regions(region_id),
    crop_category   crop_category NOT NULL,
    crop_name       VARCHAR(100) NOT NULL,          -- e.g. 'Roma Tomatoes', 'Garden Eggs (Round)'
    description     TEXT,
    quantity_available NUMERIC(10,2) NOT NULL CHECK (quantity_available >= 0),
    unit            unit_type NOT NULL,
    price_per_unit  NUMERIC(10,2) NOT NULL CHECK (price_per_unit >= 0),
    image_url       VARCHAR(255),
    latitude        NUMERIC(9,6) NOT NULL,          -- pickup/farm geolocation
    longitude       NUMERIC(9,6) NOT NULL,
    status          listing_status NOT NULL DEFAULT 'active',
    harvested_at    DATE,                            -- supports "spoilage score" inputs
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_farmer ON products(farmer_id);
CREATE INDEX idx_products_category ON products(crop_category);
CREATE INDEX idx_products_region ON products(region_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_location ON products(latitude, longitude);

-- Inventory change log (supports "Inventory Tracker: update availability or mark as sold")
CREATE TABLE inventory_logs (
    log_id          SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    change_type     VARCHAR(30) NOT NULL,   -- 'restock', 'sale_deduction', 'manual_update', 'marked_sold_out'
    quantity_delta  NUMERIC(10,2) NOT NULL, -- positive or negative
    resulting_quantity NUMERIC(10,2) NOT NULL,
    note            VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_logs_product ON inventory_logs(product_id);


-- ---------------------------------------------------------------------
-- 3. ORDERS / TRANSACTIONS (Escrow + Payment)
-- ---------------------------------------------------------------------

CREATE TABLE orders (
    order_id        SERIAL PRIMARY KEY,
    buyer_id        INTEGER NOT NULL REFERENCES users(user_id),
    farmer_id       INTEGER NOT NULL REFERENCES users(user_id),
    product_id      INTEGER NOT NULL REFERENCES products(product_id),
    quantity_ordered NUMERIC(10,2) NOT NULL CHECK (quantity_ordered > 0),
    unit_price_snapshot NUMERIC(10,2) NOT NULL,     -- price at time of order
    total_amount    NUMERIC(12,2) NOT NULL,         -- quantity_ordered * unit_price_snapshot
    delivery_fee    NUMERIC(10,2) DEFAULT 0,
    grand_total     NUMERIC(12,2) NOT NULL,         -- total_amount + delivery_fee
    status          order_status NOT NULL DEFAULT 'pending_payment',
    delivery_address VARCHAR(255),
    delivery_latitude  NUMERIC(9,6),
    delivery_longitude NUMERIC(9,6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_farmer ON orders(farmer_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Payment / escrow transaction record (Mobile Money integration)
CREATE TABLE transactions (
    transaction_id  SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    payer_id        INTEGER NOT NULL REFERENCES users(user_id),   -- buyer
    payee_id        INTEGER REFERENCES users(user_id),            -- farmer (on release)
    payment_method  payment_method NOT NULL DEFAULT 'mobile_money',
    amount          NUMERIC(12,2) NOT NULL,
    momo_reference  VARCHAR(100),                -- provider transaction ref
    escrow_status   VARCHAR(20) NOT NULL DEFAULT 'held', -- 'held', 'released', 'refunded'
    authorized_at   TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_order ON transactions(order_id);


-- ---------------------------------------------------------------------
-- 4. LOGISTICS_TRIPS (Smart Delivery Core)
-- ---------------------------------------------------------------------

CREATE TABLE logistics_trips (
    trip_id         SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    driver_id       INTEGER REFERENCES users(user_id),   -- nullable until matched

    pickup_latitude    NUMERIC(9,6) NOT NULL,   -- farmer location (copied from product)
    pickup_longitude   NUMERIC(9,6) NOT NULL,
    dropoff_latitude   NUMERIC(9,6) NOT NULL,   -- buyer delivery location (copied from order)
    dropoff_longitude  NUMERIC(9,6) NOT NULL,

    distance_km        NUMERIC(8,2),            -- computed route distance
    estimated_cost     NUMERIC(10,2),           -- distance_km * driver.cost_per_km (+ base fee)
    estimated_duration_minutes INTEGER,

    spoilage_score     NUMERIC(5,2),            -- bonus matching algorithm output (0-100)
    status             trip_status NOT NULL DEFAULT 'requested',

    matched_at         TIMESTAMPTZ,
    picked_up_at       TIMESTAMPTZ,
    delivered_at       TIMESTAMPTZ,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_order ON logistics_trips(order_id);
CREATE INDEX idx_trips_driver ON logistics_trips(driver_id);
CREATE INDEX idx_trips_status ON logistics_trips(status);

-- Live tracking pings (4.3 Live Order Tracking)
CREATE TABLE trip_tracking_events (
    event_id        SERIAL PRIMARY KEY,
    trip_id         INTEGER NOT NULL REFERENCES logistics_trips(trip_id) ON DELETE CASCADE,
    latitude        NUMERIC(9,6) NOT NULL,
    longitude       NUMERIC(9,6) NOT NULL,
    status_at_event trip_status NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracking_trip ON trip_tracking_events(trip_id);


-- ---------------------------------------------------------------------
-- 5. COMMUNICATION & ANALYTICS
-- ---------------------------------------------------------------------

-- In-app messaging (buyer-farmer, buyer-driver)
CREATE TABLE messages (
    message_id      SERIAL PRIMARY KEY,
    order_id        INTEGER REFERENCES orders(order_id) ON DELETE CASCADE, -- context, nullable for general chats
    sender_id       INTEGER NOT NULL REFERENCES users(user_id),
    recipient_id    INTEGER NOT NULL REFERENCES users(user_id),
    message_text    TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_order ON messages(order_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, is_read);

-- Ratings & reviews (post-delivery accountability)
CREATE TABLE reviews (
    review_id       SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    reviewer_id     INTEGER NOT NULL REFERENCES users(user_id),
    reviewee_id     INTEGER NOT NULL REFERENCES users(user_id),  -- farmer, buyer, or driver being rated
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, reviewer_id, reviewee_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);

-- Notifications (push/SMS/USSD) for new listings, orders, deliveries
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel         notification_channel NOT NULL DEFAULT 'app_push',
    title           VARCHAR(120),
    body            TEXT NOT NULL,
    related_order_id INTEGER REFERENCES orders(order_id),
    is_sent         BOOLEAN NOT NULL DEFAULT FALSE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);


-- ---------------------------------------------------------------------
-- 6. USSD / SMS SESSION SUPPORT (Bonus: low-connectivity access)
-- ---------------------------------------------------------------------

CREATE TABLE ussd_sessions (
    session_id      VARCHAR(64) PRIMARY KEY,    -- provided by telco USSD gateway
    user_id         INTEGER REFERENCES users(user_id),
    phone_number    VARCHAR(20) NOT NULL,
    current_menu    VARCHAR(50) NOT NULL,        -- e.g. 'MAIN', 'LIST_PRODUCE', 'SET_PRICE'
    session_data    JSONB,                       -- temporary form state across menu steps
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ
);

CREATE INDEX idx_ussd_phone ON ussd_sessions(phone_number);


-- =====================================================================
-- ORDER & DELIVERY STATE MACHINE (reference, enforced in application layer)
-- =====================================================================
--
-- ORDER STATUS FLOW:
--
--   pending_payment
--        │  (buyer authorizes MoMo payment)
--        ▼
--   escrow_held
--        │  (payment confirmed by MoMo provider)
--        ▼
--   awaiting_dispatch
--        │  (Match Nearby Driver triggers logistics_trips insert)
--        ▼
--   matched ───────────────► (driver rejects → back to awaiting_dispatch)
--        │  (driver picks up produce)
--        ▼
--   in_transit
--        │  (driver marks delivered / geofence trigger)
--        ▼
--   delivered
--        │  (escrow auto-release after delivery confirmation window,
--        │   or buyer confirms receipt)
--        ▼
--   completed
--
--   Any state before 'in_transit' → cancelled (buyer/farmer initiated, triggers refund)
--   Any state → disputed (review/flag raised by either party)
--
-- LOGISTICS TRIP STATUS FLOW:
--
--   requested ──► matched ──► picked_up ──► in_transit ──► delivered
--        │            │
--        │            └──► rejected ──► (re-requested / re-matched)
--        └──► cancelled (order cancelled before match)
--
-- =====================================================================
