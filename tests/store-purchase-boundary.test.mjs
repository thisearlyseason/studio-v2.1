import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';

const PURCHASE_HANDLERS = [
  './src/app/api/checkout/route.ts',
  './src/app/api/stripe/create-checkout/route.ts',
  './src/app/api/stripe/customer-portal/route.ts',
  './src/app/api/stripe/payment-items/route.ts',
  './src/app/api/stripe/fundraising-link/route.ts',
  './src/app/api/stripe/connect/onboard/route.ts',
  './src/app/api/subscription/addon/route.ts',
  './src/app/api/subscription/update/route.ts',
];

function runModuleProbe(source, distribution) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', source],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_APP_DISTRIBUTION: distribution },
    },
  );
}

function runVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-store-target.mjs', ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function withIdentityServer(callback) {
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect/api/app-distribution') {
      response.writeHead(302, { location: '/store/api/app-distribution' });
      response.end();
      return;
    }
    const bodies = {
      '/store/api/app-distribution': JSON.stringify({ distribution: 'store' }),
      '/web/api/app-distribution': JSON.stringify({ distribution: 'web' }),
      '/invalid/api/app-distribution': JSON.stringify({ distribution: 'native-ish' }),
      '/missing/api/app-distribution': JSON.stringify({ ok: true }),
    };
    const body = bodies[request.url] ?? JSON.stringify({ error: 'not found' });
    response.writeHead(request.url in bodies ? 200 : 404, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('store purchase guard is neutral and web mode leaves handlers unchanged', () => {
  const source = `
    import { storePurchaseResponse } from './src/lib/store-request-guard.ts';
    const response = storePurchaseResponse();
    console.log(JSON.stringify(response ? {
      status: response.status,
      body: await response.text(),
      cacheControl: response.headers.get('cache-control'),
    } : null));
  `;

  const store = runModuleProbe(source, 'store');
  assert.equal(store.status, 0, store.stderr);
  assert.deepEqual(JSON.parse(store.stdout), {
    status: 403,
    body: '',
    cacheControl: 'no-store',
  });

  const web = runModuleProbe(source, 'web');
  assert.equal(web.status, 0, web.stderr);
  assert.equal(JSON.parse(web.stdout), null);
});

test('every purchase-creation handler refuses store requests before authentication', () => {
  for (const handlerPath of PURCHASE_HANDLERS) {
    const source = `
      const { POST } = await import(${JSON.stringify(handlerPath)});
      const response = await POST(new Request('https://app.local${handlerPath}', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalid',
      }));
      console.log(JSON.stringify({ status: response.status, body: await response.text() }));
    `;
    const result = runModuleProbe(source, 'store');
    assert.equal(result.status, 0, `${handlerPath}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), { status: 403, body: '' }, handlerPath);
  }
});

test('distribution identity endpoint reports the compiled store mode without caching', () => {
  const source = `
    const { GET } = await import('./src/app/api/app-distribution/route.ts');
    const response = await GET();
    console.log(JSON.stringify({
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      body: await response.json(),
    }));
  `;
  const result = runModuleProbe(source, 'store');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 200,
    cacheControl: 'no-store',
    body: { distribution: 'store' },
  });
});

test('store target verifier accepts only direct verified store identities', async () => {
  await withIdentityServer(async origin => {
    const accepted = await runVerifier(['--allow-http-local', `${origin}/store`]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /verified store distribution/i);

    for (const pathname of ['/web', '/invalid', '/missing', '/redirect']) {
      const rejected = await runVerifier(['--allow-http-local', `${origin}${pathname}`]);
      assert.notEqual(rejected.status, 0, `${pathname} should fail`);
    }

    const insecure = await runVerifier([`${origin}/store`]);
    assert.notEqual(insecure.status, 0);
    assert.match(insecure.stderr, /HTTPS/i);
  });

  const unreachable = await runVerifier(['--allow-http-local', 'http://127.0.0.1:1/store']);
  assert.notEqual(unreachable.status, 0);
});
