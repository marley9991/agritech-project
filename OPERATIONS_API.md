# Farmer verification API

All operations endpoints require a JWT bearer token. Only users with `operations` or `admin` roles may use the review endpoints.

## Farmer endpoints

### `GET /api/farmer/onboarding`

Returns the authenticated farmer's application status.

```json
{
  "application": {
    "user_id": 42,
    "farm_name": "Ama's Fresh Farm",
    "primary_crops": ["tomato", "pepper"],
    "onboarding_status": "in_review",
    "rejection_reason": null
  }
}
```

### `POST /api/farmer/onboarding/submit`

Submits or resubmits the farmer application.

```json
{
  "farm_name": "Ama's Fresh Farm",
  "farm_size_acres": 4.5,
  "primary_crops": ["tomato", "pepper"],
  "years_farming": 8
}
```

The application becomes `in_review`. A successful response uses HTTP `202`.

## Operations queue

### `GET /api/operations/farmers`

Query parameters:

```text
status=all|not_started|in_review|approved|rejected
region_id=2
search=Ama
limit=50
offset=0
```

The queue prioritizes applications currently `in_review`, then drafts, then completed applications.

### `GET /api/operations/farmers/:farmerId`

Returns the farmer profile plus the most recent audit events. Full payout or identity-document secrets must not be returned by this endpoint.

## Review action

### `PATCH /api/operations/farmers/:farmerId/review`

Request body:

```json
{
  "action": "approve",
  "reason": "",
  "notes": []
}
```

Supported actions:

```text
approve
request_changes
reject
```

For `request_changes` and `reject`, `reason` or at least one `notes` item is required.

### Approve

```json
{
  "action": "approve"
}
```

Effects:

- Sets `farmer_profiles.onboarding_status` to `approved`.
- Sets `users.is_verified` to `true`.
- Keeps the account active.
- Writes a `farmer_approve` audit event.
- Creates an in-app notification.
- Allows the farmer to publish produce through `POST /api/products`.

### Request changes

```json
{
  "action": "request_changes",
  "reason": "Farm proof is incomplete",
  "notes": ["Upload farm proof", "Confirm payout account name"]
}
```

Effects:

- Sets onboarding status back to `in_review`.
- Stores the reason for the farmer-facing status screen.
- Writes an audit event.
- Creates an in-app notification.

### Reject

```json
{
  "action": "reject",
  "reason": "Unable to verify farm location"
}
```

Effects:

- Sets onboarding status to `rejected`.
- Sets `users.is_verified` to `false`.
- Stores the rejection reason.
- Writes an audit event.
- Creates an in-app notification.

## Controller safety rules

The review controller uses a database transaction and row lock. It validates the farmer before changing anything, prevents approval of an incomplete farm profile, updates the profile and user atomically, records an audit event, and sends the notification before committing.

The route is not protected by UI visibility alone. The backend `requireAuth` and `requireRole('operations', 'admin')` middleware enforce access.

A farmer listing is also blocked unless the farmer's onboarding status is `approved`.
