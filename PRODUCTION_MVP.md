# AgriConnect Production MVP

## Launch position

AgriConnect will launch **Ghana-first** as a farmer-to-buyer marketplace for restaurants, retailers, processors, and household buyers. The first operating corridor is **Volta/Central supply to Greater Accra demand**.

The product is not only a listing directory. The paid value is a reliable transaction loop:

1. A farmer lists fresh produce.
2. A buyer places an order and pays through Mobile Money.
3. AgriConnect coordinates a driver using spoilage-aware matching.
4. The buyer confirms delivery.
5. The farmer receives the sale payout and AgriConnect retains its commission.

## Initial monetization

- **Marketplace commission:** 10% of produce subtotal, configurable through `COMMISSION_RATE`.
- **Delivery margin:** initially passed through transparently; introduce a separate logistics margin only after route economics are measured.
- **No subscriptions at launch:** avoid adding farmer or buyer friction before repeat order behavior is proven.
- **Future revenue:** featured listings and buyer subscriptions after the core order loop reaches repeat usage.

For every order, the system must record:

- produce subtotal
- AgriConnect platform fee
- farmer payout
- delivery fee
- buyer grand total
- payment provider reference
- escrow and release status

## MVP roles

### Buyer

- Account creation and phone/password sign-in
- Browse and search produce
- View farmer, harvest age, stock, price, and route information
- Checkout with MTN MoMo first
- View order status and delivery tracking
- Confirm delivery, review, and request support

### Farmer

- Account creation and profile verification
- Create, update, pause, and restock listings
- See pending orders and expected payout
- Confirm handover to driver
- View completed sales and earnings

### Driver partner

- Driver profile and vehicle details
- Availability toggle
- Accept/reject assigned trips
- Pickup, in-transit, and delivered status updates
- Delivery proof and route updates

### Operations/admin

- Verify farmers and drivers
- Monitor orders, payment events, disputes, and payouts
- Override or reassign trips
- View gross merchandise value, platform fees, farmer payouts, and delivery performance

## Production gates

The app should not be presented as live commerce until these gates pass:

- Managed PostgreSQL database is healthy and backed up.
- Authentication is enabled; demo auth bypass is removed.
- MTN MoMo credentials and webhook URL are configured in server environment variables.
- Payment webhooks are idempotent and signature-verified.
- Inventory decrement is transactional and cannot oversell stock.
- Every payment and payout has a reconciliation record.
- Admin access uses real authenticated roles, not a default shared key.
- HTTPS, rate limiting, request logging, and secrets are configured.
- A buyer-to-delivery happy path is tested in a staging environment.
- Terms, privacy notice, refund policy, and support contact are published.

## Current implementation milestone

The repository now contains the first production foundation changes:

- Corrected Docker Compose paths for the flat repository structure.
- Restored the real authentication gate.
- Added explicit `platform_fee` and `farmer_payout` fields.
- Added an immutable `payment_events` reconciliation table.
- Made order creation transactional with row locking and inventory logs.
- Added production database migration checks and fail-fast startup when PostgreSQL is unavailable.

## Next build order

1. Reconnect a managed PostgreSQL instance and run schema/migration checks.
2. Replace the shared admin-key endpoints with an authenticated operations role.
3. Add the MTN MoMo payment adapter and signed webhook reconciliation.
4. Add buyer checkout states: payment pending, paid, failed, refunded.
5. Add farmer earnings and payout workflows.
6. Add driver acceptance and proof-of-delivery controls.
7. Add rate limiting, audit logs, monitoring, backups, and staging deployment.
8. Run a controlled pilot with a small set of verified farms, buyers, and drivers.

## Environment contract

At minimum, production should provide:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-secret>
ADMIN_KEY=<temporary-only-during-migration>
COMMISSION_RATE=0.10
MOMO_BASE_URL=<provider-url>
MOMO_API_KEY=<server-secret>
MOMO_SUBSCRIPTION_KEY=<server-secret>
MOMO_TARGET_ENVIRONMENT=production
MOMO_CALLBACK_URL=https://api.example.com/api/payments/momo/webhook
```

Never commit real values to the repository. Use the deployment provider's secret manager.
