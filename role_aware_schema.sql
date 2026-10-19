-- AgriConnect role-aware production schema
-- PostgreSQL 14+
-- Scope: users, role profiles, farmer onboarding, payout methods,
-- products/inventory, orders, payments, and payout ledger.
-- Run this as a fresh schema or adapt it into a migration for an existing DB.

BEGIN;

CREATE TYPE user_role AS ENUM ('buyer', 'farmer', 'driver', 'operations', 'admin');
CREATE TYPE account_status AS ENUM ('pending_review', 'active', 'suspended', 'rejected');
CREATE TYPE language_pref AS ENUM ('en', 'ga', 'tw');
CREATE TYPE onboarding_status AS ENUM ('not_started', 'in_review', 'approved', 'rejected');
CREATE TYPE payout_method_type AS ENUM ('momo', 'bank');
CREATE TYPE payout_method_status AS ENUM ('pending_verification', 'verified', 'rejected', 'disabled');
CREATE TYPE crop_category AS ENUM ('tomato', 'pepper', 'garden_egg', 'okra', 'leafy_greens', 'other');
CREATE TYPE unit_type AS ENUM ('bag', 'crate', 'basket', 'kg', 'box');
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'low_stock', 'sold_out', 'inactive');
CREATE TYPE order_status AS ENUM (
  'pending_payment', 'payment_submitted', 'payment_verified',
  'awaiting_dispatch', 'matched', 'in_transit', 'delivered',
  'completed', 'cancelled', 'disputed'
);
CREATE TYPE payment_method AS ENUM ('manual_momo', 'momo_api', 'cash_on_delivery', 'bank_transfer');
CREATE TYPE payment_status AS ENUM ('pending', 'submitted', 'verified', 'failed', 'refunded', 'rejected');
CREATE TYPE payout_status AS ENUM ('pending', 'approved', 'processing', 'paid', 'failed', 'cancelled');

CREATE TABLE regions (
  region_id SERIAL PRIMARY KEY,
  region_name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT,
  role user_role NOT NULL,
  account_status account_status NOT NULL DEFAULT 'pending_review',
  language_pref language_pref NOT NULL DEFAULT 'en',
  region_id INTEGER REFERENCES regions(region_id),
  is_ussd_user BOOLEAN NOT NULL DEFAULT FALSE,
  profile_image_url TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  phone_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role_status ON users(role, account_status);
CREATE INDEX idx_users_region ON users(region_id);
CREATE INDEX idx_users_phone ON users(phone_number);

CREATE TABLE farmer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  farm_name VARCHAR(120) NOT NULL,
  farm_size_acres NUMERIC(8,2) CHECK (farm_size_acres IS NULL OR farm_size_acres >= 0),
  primary_crops crop_category[] NOT NULL DEFAULT '{}',
  years_farming INTEGER CHECK (years_farming IS NULL OR years_farming >= 0),
  farm_address TEXT,
  onboarding_status onboarding_status NOT NULL DEFAULT 'not_started',
  onboarding_submitted_at TIMESTAMPTZ,
  onboarding_reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES users(user_id),
  rejection_reason TEXT,
  payout_ready BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE buyer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  business_name VARCHAR(120),
  buyer_type VARCHAR(50) CHECK (buyer_type IN ('household','retailer','restaurant','processor','exporter','other')),
  business_address TEXT,
  delivery_notes TEXT
);

CREATE TABLE driver_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  vehicle_type VARCHAR(50) NOT NULL,
  vehicle_capacity_kg NUMERIC(8,2) CHECK (vehicle_capacity_kg > 0),
  license_plate VARCHAR(20),
  is_refrigerated BOOLEAN NOT NULL DEFAULT FALSE,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  cost_per_km NUMERIC(8,2) CHECK (cost_per_km IS NULL OR cost_per_km >= 0),
  onboarding_status onboarding_status NOT NULL DEFAULT 'not_started'
);

CREATE TABLE farmer_onboarding_documents (
  document_id BIGSERIAL PRIMARY KEY,
  farmer_id INTEGER NOT NULL REFERENCES farmer_profiles(user_id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('identity', 'farm_proof', 'business_registration', 'cooperative_letter', 'other')),
  document_url TEXT NOT NULL,
  document_status onboarding_status NOT NULL DEFAULT 'in_review',
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES users(user_id)
);

CREATE TABLE payout_methods (
  payout_method_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  method_type payout_method_type NOT NULL,
  provider VARCHAR(40),
  account_name VARCHAR(120) NOT NULL,
  account_number_last4 VARCHAR(4),
  encrypted_account_reference TEXT,
  status payout_method_status NOT NULL DEFAULT 'pending_verification',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((method_type = 'momo' AND provider IS NOT NULL) OR method_type = 'bank')
);

CREATE UNIQUE INDEX one_default_payout_method_per_user
  ON payout_methods(user_id) WHERE is_default = TRUE;
CREATE INDEX idx_payout_methods_user ON payout_methods(user_id, status);

CREATE TABLE products (
  product_id SERIAL PRIMARY KEY,
  farmer_id INTEGER NOT NULL REFERENCES farmer_profiles(user_id),
  region_id INTEGER NOT NULL REFERENCES regions(region_id),
  crop_category crop_category NOT NULL,
  crop_name VARCHAR(100) NOT NULL,
  description TEXT,
  quantity_available NUMERIC(10,2) NOT NULL CHECK (quantity_available >= 0),
  unit unit_type NOT NULL,
  price_per_unit NUMERIC(10,2) NOT NULL CHECK (price_per_unit >= 0),
  image_url TEXT,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  status listing_status NOT NULL DEFAULT 'draft',
  harvested_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_farmer_status ON products(farmer_id, status);
CREATE INDEX idx_products_category_region ON products(crop_category, region_id);

CREATE TABLE inventory_logs (
  log_id BIGSERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  changed_by INTEGER REFERENCES users(user_id),
  change_type VARCHAR(30) NOT NULL CHECK (change_type IN ('restock','sale_deduction','manual_update','marked_sold_out')),
  quantity_delta NUMERIC(10,2) NOT NULL,
  resulting_quantity NUMERIC(10,2) NOT NULL CHECK (resulting_quantity >= 0),
  note VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  order_id BIGSERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES buyer_profiles(user_id),
  farmer_id INTEGER NOT NULL REFERENCES farmer_profiles(user_id),
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  quantity_ordered NUMERIC(10,2) NOT NULL CHECK (quantity_ordered > 0),
  unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  farmer_payout NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (farmer_payout >= 0),
  grand_total NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
  status order_status NOT NULL DEFAULT 'pending_payment',
  delivery_address TEXT NOT NULL,
  delivery_latitude NUMERIC(9,6),
  delivery_longitude NUMERIC(9,6),
  buyer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_amount = quantity_ordered * unit_price_snapshot),
  CHECK (grand_total = total_amount + delivery_fee),
  CHECK (farmer_payout = total_amount - platform_fee)
);

CREATE INDEX idx_orders_buyer_status ON orders(buyer_id, status);
CREATE INDEX idx_orders_farmer_status ON orders(farmer_id, status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE payments (
  payment_id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
  payer_id INTEGER NOT NULL REFERENCES users(user_id),
  method payment_method NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'manual_mtn_momo',
  expected_amount NUMERIC(12,2) NOT NULL CHECK (expected_amount >= 0),
  submitted_amount NUMERIC(12,2) CHECK (submitted_amount IS NULL OR submitted_amount >= 0),
  payer_phone VARCHAR(20),
  provider_reference VARCHAR(160),
  status payment_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by INTEGER REFERENCES users(user_id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX idx_payments_status ON payments(status, created_at DESC);

CREATE TABLE payment_events (
  event_id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT REFERENCES payments(payment_id) ON DELETE SET NULL,
  provider VARCHAR(40) NOT NULL,
  provider_event_id VARCHAR(160),
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE farmer_payouts (
  payout_id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
  farmer_id INTEGER NOT NULL REFERENCES farmer_profiles(user_id),
  payout_method_id BIGINT REFERENCES payout_methods(payout_method_id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status payout_status NOT NULL DEFAULT 'pending',
  provider_reference VARCHAR(160),
  approved_by INTEGER REFERENCES users(user_id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_farmer_payouts_farmer_status ON farmer_payouts(farmer_id, status);

CREATE TABLE role_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(user_id),
  target_user_id INTEGER REFERENCES users(user_id),
  action VARCHAR(80) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payout_methods_updated_at BEFORE UPDATE ON payout_methods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER farmer_payouts_updated_at BEFORE UPDATE ON farmer_payouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO regions (region_name) VALUES
  ('Greater Accra'), ('Volta Region'), ('Central Region'), ('Eastern Region'), ('Western Region')
ON CONFLICT (region_name) DO NOTHING;

COMMIT;
