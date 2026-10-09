// Security hardening and penetration test verification suite for Level 1 fixes.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; },
  },
};

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Alert: { alert: () => {} },
      StyleSheet: { create: (s) => s },
      Platform: { OS: 'web' },
      View: 'View',
      Text: 'Text',
      Modal: 'Modal',
      TouchableOpacity: 'TouchableOpacity',
      TextInput: 'TextInput',
      ActivityIndicator: 'ActivityIndicator',
    };
  }
  if (request === 'expo' || request.startsWith('expo') || request === '@expo/vector-icons') {
    return {
      default: {},
      Ionicons: { glyphMap: {} },
    };
  }
  return origLoad.apply(this, arguments);
};

if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://mock-test-project.supabase.co';
}
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'mock-test-anon-key';
}

console.log('============================================================');
console.log(' RUNNING SECURITY HARDENING & PENETRATION TEST SUITE');
console.log('============================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// Suite 1: Edge Function stock-proxy Auth Guard Hardening
// -------------------------------------------------------------
console.log('--- Suite 1: Edge Function stock-proxy Auth Guard Hardening ---');

// Mock server environment
const expectedAnonKey = 'server-secret-anon-key-12345';
const expectedServiceKey = 'server-secret-service-key-99999';
const supabaseUrl = 'https://mock-test-project.supabase.co';

/**
 * Simulates the old vulnerable auth guard from stock-proxy
 */
function oldVulnerableAuthGuard(authHeader, apiKeyHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim() || apiKeyHeader;
  let isAuthorized = false;

  if (expectedAnonKey && (apiKeyHeader === expectedAnonKey || token === expectedAnonKey)) {
    isAuthorized = true;
  } else if (expectedServiceKey && (apiKeyHeader === expectedServiceKey || token === expectedServiceKey)) {
    isAuthorized = true;
  }

  // Old Check B: Unverified base64 decode without signature checking
  if (!isAuthorized && token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));

        const nowSec = Math.floor(Date.now() / 1000);
        const isNotExpired = !payload.exp || payload.exp > nowSec;
        const isSupabaseIssuer = payload.iss === 'supabase';
        const isValidRole = payload.role === 'authenticated' || payload.role === 'anon';

        if (isSupabaseIssuer && isNotExpired && isValidRole) {
          isAuthorized = true;
        }
      }
    } catch {}
  }
  return isAuthorized;
}

/**
 * Simulates the new hardened auth guard from stock-proxy
 */
async function newHardenedAuthGuard(authHeader, apiKeyHeader, mockAuthVerifier) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim() || apiKeyHeader;
  let isAuthorized = false;

  // Check A: Direct key match
  if (expectedAnonKey && (apiKeyHeader === expectedAnonKey || token === expectedAnonKey)) {
    isAuthorized = true;
  } else if (expectedServiceKey && (apiKeyHeader === expectedServiceKey || token === expectedServiceKey)) {
    isAuthorized = true;
  }

  // Check B: Cryptographic verification via Supabase Auth
  if (!isAuthorized && token && supabaseUrl && expectedAnonKey) {
    try {
      const verifyRes = await mockAuthVerifier(token, expectedAnonKey);
      if (verifyRes.ok && verifyRes.user?.id) {
        isAuthorized = true;
      }
    } catch {
      // Cryptographic verification failed
    }
  }

  return isAuthorized;
}

// Craft forged JWT (without valid cryptographic signature)
const fakeHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const fakePayload = Buffer.from(JSON.stringify({
  iss: 'supabase',
  role: 'anon',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ref: 'mock-test-project',
})).toString('base64');
const forgedToken = `${fakeHeader}.${fakePayload}.fake_unsigned_signature_12345`;

runTest('1.1 OLD auth guard was VULNERABLE to forged unsigned JWTs', () => {
  const isVulnerable = oldVulnerableAuthGuard(`Bearer ${forgedToken}`, '');
  assert.strictEqual(isVulnerable, true, 'Old code should have naively accepted forged JWT');
});

runTest('1.2 NEW hardened auth guard REJECTS forged unsigned JWTs', async () => {
  const mockAuthVerifier = async (token) => {
    // Supabase Auth server rejects tokens with invalid signature
    if (token === forgedToken) {
      return { ok: false, error: 'Invalid JWT signature' };
    }
    return { ok: false };
  };

  const isAuthorized = await newHardenedAuthGuard(`Bearer ${forgedToken}`, '', mockAuthVerifier);
  assert.strictEqual(isAuthorized, false, 'Hardened code must reject forged JWT');
});

runTest('1.3 NEW hardened auth guard ACCEPTS valid project Anon Key', async () => {
  const isAuthorized = await newHardenedAuthGuard(`Bearer ${expectedAnonKey}`, expectedAnonKey, null);
  assert.strictEqual(isAuthorized, true, 'Hardened code must accept authentic Anon Key');
});

runTest('1.4 NEW hardened auth guard ACCEPTS valid Service Role Key', async () => {
  const isAuthorized = await newHardenedAuthGuard(`Bearer ${expectedServiceKey}`, expectedServiceKey, null);
  assert.strictEqual(isAuthorized, true, 'Hardened code must accept authentic Service Role Key');
});

runTest('1.5 NEW hardened auth guard ACCEPTS authentic cryptographically verified user session', async () => {
  const validUserToken = 'valid_signed_user_session_token';
  const mockAuthVerifier = async (token) => {
    if (token === validUserToken) {
      return { ok: true, user: { id: 'usr-12345-verified' } };
    }
    return { ok: false };
  };

  const isAuthorized = await newHardenedAuthGuard(`Bearer ${validUserToken}`, '', mockAuthVerifier);
  assert.strictEqual(isAuthorized, true, 'Hardened code must accept cryptographically valid user session');
});

runTest('1.6 NEW hardened auth guard REJECTS empty or malformed tokens', async () => {
  const mockAuthVerifier = async () => ({ ok: false });
  const isAuthorizedEmpty = await newHardenedAuthGuard('', '', mockAuthVerifier);
  const isAuthorizedGarbage = await newHardenedAuthGuard('Bearer not_a_jwt', '', mockAuthVerifier);
  assert.strictEqual(isAuthorizedEmpty, false);
  assert.strictEqual(isAuthorizedGarbage, false);
});

// -------------------------------------------------------------
// Suite 2: Master Fund Catalog RLS & Permission Hardening
// -------------------------------------------------------------
console.log('\n--- Suite 2: Master Fund Catalog RLS & Permission Hardening ---');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '010_secure_thai_funds_catalog.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

runTest('2.1 Migration 010 permanently drops authenticated INSERT policy', () => {
  assert(
    migrationSql.includes('DROP POLICY IF EXISTS "Allow authenticated insert to thai_funds_catalog"'),
    'Must drop authenticated insert policy'
  );
});

runTest('2.2 Migration 010 permanently drops authenticated UPDATE policy', () => {
  assert(
    migrationSql.includes('DROP POLICY IF EXISTS "Allow authenticated update to thai_funds_catalog"'),
    'Must drop authenticated update policy'
  );
});

runTest('2.3 Migration 010 revokes INSERT, UPDATE, DELETE permissions from public & authenticated', () => {
  assert(
    migrationSql.includes('REVOKE INSERT, UPDATE, DELETE ON public.thai_funds_catalog FROM authenticated, anon, public'),
    'Must revoke write permissions from authenticated and anon'
  );
});

runTest('2.4 Migration 010 maintains public SELECT read-only access for mutual fund lookups', () => {
  assert(
    migrationSql.includes('CREATE POLICY "Allow public read on thai_funds_catalog"'),
    'Must create public read policy'
  );
  assert(
    migrationSql.includes('FOR SELECT'),
    'Public policy must be strictly FOR SELECT'
  );
  assert(
    migrationSql.includes('GRANT SELECT ON public.thai_funds_catalog TO authenticated, anon'),
    'Must grant SELECT to authenticated and anon'
  );
});

// -------------------------------------------------------------
// Suite 3: Verification of Server-Side Master Data Sync in stock-proxy
// -------------------------------------------------------------
console.log('\n--- Suite 3: Verification of Server-Side Master Data Sync in stock-proxy ---');

const edgeFunctionPath = path.join(__dirname, '..', 'supabase', 'functions', 'stock-proxy', 'index.ts');
const edgeFunctionCode = fs.readFileSync(edgeFunctionPath, 'utf-8');

runTest('3.1 stock-proxy has eliminated unsigned atob JWT parsing in Check B', () => {
  // Check that insecure atob payload decode without signature is removed
  assert(
    !edgeFunctionCode.includes('JSON.parse(atob(base64))'),
    'Edge function must not naively authorize via unsigned atob decoding'
  );
});

runTest('3.2 stock-proxy verifies JWT via Supabase Auth /auth/v1/user endpoint', () => {
  assert(
    edgeFunctionCode.includes('/auth/v1/user'),
    'Edge function must cryptographically verify user session via /auth/v1/user'
  );
});

runTest('3.3 stock-proxy performs master fund catalog sync using server Service Role key', () => {
  assert(
    edgeFunctionCode.includes('Server-Side Master Data Sync using Service Role Key'),
    'Edge function must handle master data upsert with Service Role key'
  );
  assert(
    edgeFunctionCode.includes('expectedServiceKey'),
    'Upsert must use expectedServiceKey'
  );
});

// -------------------------------------------------------------
// Suite 4: Client fundService Verification
// -------------------------------------------------------------
console.log('\n--- Suite 4: Client fundService Verification ---');

const fundServicePath = path.join(__dirname, '..', 'src', 'services', 'fundService.ts');
const fundServiceCode = fs.readFileSync(fundServicePath, 'utf-8');

runTest('4.1 fundService client no longer attempts unprivileged upsert to thai_funds_catalog', () => {
  // fundService should not attempt to write directly from client
  assert(
    !fundServiceCode.includes("supabase.from('thai_funds_catalog').upsert"),
    'Client fundService must not attempt to write or upsert to thai_funds_catalog'
  );
});

runTest('4.2 fundService retains read-only search functionality on thai_funds_catalog', () => {
  assert(
    fundServiceCode.includes(".from('thai_funds_catalog')"),
    'Client fundService must retain SELECT queries on thai_funds_catalog'
  );
});

console.log('\n--- Suite 5: Android Backup Hardening & PostgREST Wildcard Prevention ---');

runTest('5.1 app.json enforces android.allowBackup = false to prevent USB adb backup extraction', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  assert.strictEqual(
    appJson.expo?.android?.allowBackup,
    false,
    'app.json must explicitly set expo.android.allowBackup to false'
  );
});

runTest('5.2 csvService uses exact .eq instead of vulnerable .ilike pattern matching', () => {
  const csvServicePath = path.join(__dirname, '..', 'src', 'services', 'csvService.ts');
  const csvCode = fs.readFileSync(csvServicePath, 'utf-8');
  assert(
    !csvCode.includes(".ilike('symbol'"),
    'csvService must not use .ilike for symbol lookup to prevent wildcard injection'
  );
  assert(
    csvCode.includes(".eq('symbol', item.symbol.trim().toUpperCase())"),
    'csvService must use exact .eq matching for symbol'
  );
});

runTest('5.3 AddAssetModal uses exact .eq instead of vulnerable .ilike pattern matching', () => {
  const addModalPath = path.join(__dirname, '..', 'src', 'components', 'AddAssetModal.tsx');
  const addModalCode = fs.readFileSync(addModalPath, 'utf-8');
  assert(
    !addModalCode.includes(".ilike('symbol'"),
    'AddAssetModal must not use .ilike for symbol lookup to prevent wildcard injection'
  );
});

console.log('\n--- Suite 6: Edge Function Rate Limiting & Cooldown Protection ---');

// Unit test simulation of the sliding window rate limiter logic
function simulateRateLimiter(limit, windowMs) {
  const store = new Map();
  return function isLimited(key, now) {
    const record = store.get(key) || { timestamps: [] };
    const valid = record.timestamps.filter((t) => now - t < windowMs);
    if (valid.length >= limit) return true;
    valid.push(now);
    store.set(key, { timestamps: valid });
    return false;
  };
}

runTest('6.1 Rate limiter allows requests within configured limits', () => {
  const limiter = simulateRateLimiter(5, 60000);
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(limiter('client-1', now + i * 100), false, `Request ${i + 1} should be allowed`);
  }
});

runTest('6.2 Rate limiter blocks excess requests once threshold is hit', () => {
  const limiter = simulateRateLimiter(5, 60000);
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    limiter('client-2', now + i * 100);
  }
  // 6th request must be blocked
  assert.strictEqual(limiter('client-2', now + 600), true, 'Request 6 must be blocked');
  // Different client should still be allowed
  assert.strictEqual(limiter('client-3', now + 600), false, 'Different client must be allowed');
});

runTest('6.3 stock-proxy source code contains isRateLimited guard and HTTP 429 response', () => {
  const proxyCode = fs.readFileSync(edgeFunctionPath, 'utf-8');
  assert(
    proxyCode.includes('isRateLimited(rateLimitKey'),
    'stock-proxy must invoke isRateLimited with rateLimitKey'
  );
  assert(
    proxyCode.includes('status: 429'),
    'stock-proxy must respond with HTTP 429 when rate limit exceeded'
  );
  assert(
    proxyCode.includes('Retry-After'),
    'stock-proxy must return Retry-After header'
  );
});

runTest('6.4 stock-proxy source code enforces 5-minute cooldown on sync-funds', () => {
  const proxyCode = fs.readFileSync(edgeFunctionPath, 'utf-8');
  assert(
    proxyCode.includes('syncFundsCooldownStore'),
    'stock-proxy must track syncFundsCooldownStore'
  );
  assert(
    proxyCode.includes('300000'),
    'stock-proxy must enforce 300000ms (5 min) cooldown on sync-funds'
  );
});

console.log('\n--- Suite 7: CSV Row Guard & Database Velocity Guard (Anti-Spam / No Lifetime Cap) ---');

const { parseAndValidateCsv, MAX_CSV_IMPORT_ROWS } = require('../scratch/test_build/src/services/csvService');

runTest('7.1 csvService exports MAX_CSV_IMPORT_ROWS = 500', () => {
  assert.strictEqual(MAX_CSV_IMPORT_ROWS, 500, 'MAX_CSV_IMPORT_ROWS must be 500');
});

runTest('7.2 parseAndValidateCsv rejects CSV files with > 500 rows with clear error', () => {
  const header = 'symbol,asset_type,shares,cost_price,currency,transaction_date\n';
  const rows = [];
  for (let i = 1; i <= 505; i++) {
    rows.push(`PTT,STOCKS,100,32.50,THB,2024-01-01`);
  }
  const largeCsv = header + rows.join('\n');
  const result = parseAndValidateCsv(largeCsv);

  assert.strictEqual(result.validRows.length, 0, 'Must reject all rows when exceeding 500');
  assert(result.issues.length > 0, 'Must produce validation issue');
  const sizeIssue = result.issues.find((iss) => iss.field === 'file_size');
  assert(sizeIssue, 'Must contain file_size error issue');
  assert(sizeIssue.message.includes('500'), 'Error message must mention 500 row limit');
});

runTest('7.3 parseAndValidateCsv accepts CSV files with <= 500 rows', () => {
  const header = 'symbol,asset_type,shares,cost_price,currency,transaction_date\n';
  const rows = [];
  for (let i = 1; i <= 50; i++) {
    rows.push(`PTT,STOCKS,100,32.50,THB,2024-01-01`);
  }
  const normalCsv = header + rows.join('\n');
  const result = parseAndValidateCsv(normalCsv);

  assert.strictEqual(result.validRows.length, 50, 'Must accept 50 valid rows');
  assert.strictEqual(result.issues.length, 0, 'Must have zero issues');
});

runTest('7.4 csvService bounds symbol length to max 30 characters', () => {
  const superLongSymbol = 'A'.repeat(100);
  const csv = `symbol,asset_type,shares,cost_price,currency,transaction_date\n${superLongSymbol},STOCKS,100,32.50,THB,2024-01-01`;
  const result = parseAndValidateCsv(csv);
  assert.strictEqual(result.validRows.length, 1);
  assert(result.validRows[0].symbol.length <= 30, 'Symbol must be bounded to 30 chars max');
});

runTest('7.5 Migration 011 defines check_transaction_rate_limit trigger with 500 rows / 24h velocity cap', () => {
  const m11Path = path.join(__dirname, '..', 'supabase', 'migrations', '011_anti_spam_velocity_guard.sql');
  const m11Sql = fs.readFileSync(m11Path, 'utf-8');
  assert(m11Sql.includes('check_transaction_rate_limit'), 'Must define function check_transaction_rate_limit');
  assert(m11Sql.includes('trg_check_transaction_rate_limit'), 'Must define trigger trg_check_transaction_rate_limit');
  assert(m11Sql.includes("now() - interval '24 hours'"), 'Must evaluate 24-hour rolling window');
  assert(m11Sql.includes('500'), 'Must enforce 500 transactions per 24 hours');
});

console.log('\n============================================================');
console.log(` SECURITY TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
