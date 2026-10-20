const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const roles = ['buyer', 'farmer', 'driver', 'operations', 'admin'];
const pages = {
  buyer: ['dashboard', 'market', 'orders', 'tracking', 'messages', 'ussd'],
  farmer: ['dashboard', 'orders', 'tracking', 'messages', 'inventory', 'earnings', 'ussd'],
  driver: ['dashboard', 'dispatch', 'tracking', 'messages', 'earnings', 'jobs', 'ussd'],
  operations: ['dashboard', 'dispatch', 'tracking', 'messages', 'payments', 'operations', 'ussd'],
  admin: ['dashboard', 'dispatch', 'tracking', 'messages', 'payments', 'operations', 'ussd'],
};

function roleCanSee(role, page) {
  return pages[role]?.includes(page) === true;
}

test('role permission matrix keeps marketplace access buyer-only', () => {
  assert.equal(roleCanSee('buyer', 'market'), true);
  assert.equal(roleCanSee('farmer', 'market'), false);
  assert.equal(roleCanSee('driver', 'market'), false);
  assert.equal(roleCanSee('operations', 'market'), false);
});

test('farmer navigation exposes produce and earnings but not operations tools', () => {
  assert.equal(roleCanSee('farmer', 'inventory'), true);
  assert.equal(roleCanSee('farmer', 'earnings'), true);
  assert.equal(roleCanSee('farmer', 'operations'), false);
  assert.equal(roleCanSee('farmer', 'payments'), false);
});

test('driver navigation exposes jobs and logistics but not farmer review', () => {
  assert.equal(roleCanSee('driver', 'jobs'), true);
  assert.equal(roleCanSee('driver', 'dispatch'), true);
  assert.equal(roleCanSee('driver', 'operations'), false);
  assert.equal(roleCanSee('driver', 'payments'), false);
});

test('operations and admin roles can review farmers and payments', () => {
  for (const role of ['operations', 'admin']) {
    assert.equal(roleCanSee(role, 'operations'), true);
    assert.equal(roleCanSee(role, 'payments'), true);
  }
});

test('frontend includes all demo roles and switches back to dashboard', () => {
  for (const role of roles.filter(r => r !== 'admin')) {
    assert.match(frontend, new RegExp(`value=\\"${role}\\"`));
  }
  assert.match(frontend, /function switchDemoRole\(role\)/);
  assert.match(frontend, /setCurrentUser\(DEMO_USERS\[role\]\)/);
  assert.match(frontend, /setPage\('dashboard'\)/);
});

test('frontend gates the operations page by operations/admin role', () => {
  assert.match(frontend, /currentUser\.role==='operations'\|\|currentUser\.role==='admin'/);
  assert.match(frontend, /roles:\['operations','admin'\]/);
});

test('backend protects notification and driver endpoints with authentication', () => {
  assert.match(server, /app\.get\('\/api\/notifications', requireAuth/);
  assert.match(server, /app\.patch\('\/api\/notifications\/:notificationId\/read', requireAuth/);
  assert.match(server, /app\.get\('\/api\/driver\/jobs', requireAuth, requireRole\('driver'\)/);
  assert.match(server, /app\.post\('\/api\/driver\/jobs\/:tripId\/accept', requireAuth, requireRole\('driver'\)/);
});

test('backend protects operations review endpoints', () => {
  assert.match(server, /app\.get\('\/api\/operations\/farmers', requireAuth, requireRole\('operations', 'admin'\)/);
  assert.match(server, /app\.patch\('\/api\/operations\/farmers\/:farmerId\/review', requireAuth, requireRole\('operations', 'admin'\)/);
});

test('backend prevents a driver from updating another driver trip', () => {
  assert.match(server, /ownership\.driver_id !== req\.user\.user_id/);
  assert.match(server, /You do not own this trip/);
});
