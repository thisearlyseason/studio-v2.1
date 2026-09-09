// Consumes gcloud functions describe JSON on stdin; never prints secret values.
const required = ['WEB_PUSH_VAPID_SUBJECT', 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY'];
try {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const metadata = JSON.parse(raw);
  if (metadata.state !== 'ACTIVE') throw Error('Reminder Function is not ACTIVE.');
  const bindings = metadata.serviceConfig?.secretEnvironmentVariables || [];
  const missing = required.filter(key => !bindings.some(binding =>
    binding.key === key && binding.secret === key && binding.version && binding.projectId
  ));
  if (missing.length) throw Error(`Missing reminder secret bindings: ${missing.join(', ')}`);
  console.log('PASS: active reminder Function binds all required Web Push secrets.');
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid Function metadata JSON.' : error.message);
  process.exitCode = 1;
}
