#!/usr/bin/env node

const args = process.argv.slice(2);
const allowHttpLocal = args.includes('--allow-http-local');
const targetArgument = args.find(argument => !argument.startsWith('--'));

function fail(message) {
  console.error(`Store target verification failed: ${message}`);
  process.exitCode = 1;
}

if (!targetArgument) {
  fail('a deployment URL is required.');
} else {
  let target;
  try {
    target = new URL(targetArgument);
  } catch {
    fail('the deployment URL is invalid.');
  }

  if (target) {
    const isExplicitLocalHttp =
      allowHttpLocal &&
      target.protocol === 'http:' &&
      (target.hostname === '127.0.0.1' || target.hostname === 'localhost');
    if (target.protocol !== 'https:' && !isExplicitLocalHttp) {
      fail('HTTPS is required (use --allow-http-local only for an explicit local test).');
    } else {
      target.pathname = `${target.pathname.replace(/\/$/, '')}/api/app-distribution`;
      target.search = '';
      target.hash = '';

      try {
        const response = await fetch(target, {
          redirect: 'manual',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status >= 300 && response.status < 400) {
          fail(`identity endpoint redirected with HTTP ${response.status}.`);
        } else if (!response.ok) {
          fail(`identity endpoint returned HTTP ${response.status}.`);
        } else {
          const body = await response.json().catch(() => null);
          if (body?.distribution !== 'store') {
            fail('identity endpoint did not report distribution "store".');
          } else {
            console.log(`Verified store distribution at ${target.origin}.`);
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'identity request failed.');
      }
    }
  }
}
