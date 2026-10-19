# AgriConnect Farmer Onboarding and Payout UI

## Registration principle

The registration form should ask the user to choose a role first: Buyer, Farmer, or Driver. The rest of the form changes based on that choice. Do not ask a buyer for farmer documents or payout details.

For the current no-login demo, keep this flow behind a clearly labelled `Demo mode` switch. Do not collect real payout credentials in demo mode.

## Farmer registration screens

### 1. Role selection

Show three large cards:

- Buyer: Buy fresh produce and track deliveries.
- Farmer: List produce and receive orders.
- Driver: Deliver produce and earn per trip.

When Farmer is selected, show a short note:

> Farmer accounts are reviewed before produce listings become visible.

### 2. Basic profile

Required fields:

- Full name
- Phone number
- Password
- Region
- Farm name

Optional fields:

- Email
- Farm address
- Farm size
- Years farming
- Primary crops

Use a step indicator:

```text
1 Profile  →  2 Farm details  →  3 Payout method  →  4 Review
```

### 3. Farm details

Use crop chips instead of a free-text-only field:

```text
Tomatoes   Peppers   Garden eggs   Okra   Leafy greens   Other
```

Collect the farm location with either a map pin or a simple region/address field. Do not make GPS permission mandatory for registration; allow the farmer to continue with a written location.

Document uploads should be optional for the first pilot unless operations requires them. If enabled, use clear cards for:

- Government ID
- Farm proof or cooperative letter
- Business registration, if available

Each upload should show `Not uploaded`, `Submitted`, `In review`, `Approved`, or `Rejected`.

### 4. Payout method

Do not collect a MoMo PIN, OTP, wallet password, or full bank credentials in the UI.

For the manual pilot, show:

- Payout method: MTN MoMo / Telecel / AirtelTigo / Bank
- Account holder name
- Mobile-money number or bank account reference
- Confirmation checkbox: `This account belongs to me or my registered business.`

For a real implementation, the sensitive account value must be sent only over HTTPS to the backend and stored encrypted or tokenized. The UI should display only the last four digits after saving, for example:

```text
MTN MoMo · •••• 0024 · Pending verification
```

Use a warning box:

> AgriConnect will never ask for your MoMo PIN or OTP.

For the current no-document pilot, label the method:

```text
Payout setup: Pending operations verification
```

Do not promise an automatic payout until the provider and business arrangement support it.

### 5. Review and submit

Before submission, show a summary:

- Farmer name
- Farm name
- Region
- Primary crops
- Payout provider
- Masked payout number
- Missing documents, if any

The submit button should say:

```text
Submit farmer application
```

After submission, show:

> Your farmer application is under review. You can prepare produce listings, but they will not be visible to buyers until your account is approved.

## Farmer account states

Use these visible states:

- `Not started`: farmer has not completed onboarding.
- `In review`: farmer submitted the application.
- `Approved`: farmer can publish active listings.
- `Rejected`: show the reason and allow resubmission.
- `Suspended`: block selling and show a support contact.

A farmer may save a draft listing while `in_review`, but the listing must remain `draft` and invisible to buyers.

## Payout UI after approval

The Farmer Dashboard should include:

- Available balance
- Pending balance
- Lifetime earnings
- Next payout status
- Payout method card
- Payout history

Example payout card:

```text
Available to withdraw
GHS 450.00

MTN MoMo · •••• 0024
Verified

[Request payout]
```

For the manual pilot, replace the button with:

```text
Request payout review
```

This creates a payout request for operations. Operations verifies delivery and approves the request manually.

## Operations review screen

Operations should see a farmer-review queue with:

- Farmer name and farm name
- Phone number
- Region
- Primary crops
- Submitted date
- Onboarding status
- Uploaded documents
- Payout method status
- Approve, reject, and request-changes actions

The operations reviewer should be required to enter a rejection reason. Every decision should create a `role_audit_log` record.

## Backend rules

The frontend should not be trusted for role or payout authorization. The backend must enforce:

- Only farmers can create or edit their own products.
- Only farmers with `account_status = active` and `onboarding_status = approved` can publish listings.
- Only operations or admins can approve onboarding.
- Only operations or admins can verify payout methods.
- Only operations or admins can approve farmer payouts.
- Buyers cannot read farmer payout details.
- Payout account values are never returned in full after creation.

## Manual MTN MoMo pilot rule

For the current no-login demo, keep payout records in demo data only. Use the real `payout_methods` table after authentication, encryption, and operations permissions are implemented. The buyer payment-reference flow and farmer payout flow must remain separate:

```text
Buyer payment submission → operations verifies order payment
Farmer payout request → operations verifies delivery and approves farmer payout
```
