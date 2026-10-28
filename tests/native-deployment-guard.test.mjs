import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const valid={PATH:process.env.PATH,VERCEL_ENV:'preview',VERCEL_TARGET_ENV:'native-ios',NEXT_PUBLIC_APP_DISTRIBUTION:'store',NATIVE_BILLING_ENABLED:'false',NATIVE_BILLING_IOS_ENABLED:'true',NATIVE_BILLING_ANDROID_ENABLED:'false',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'studio-6850142148-fe343',private_key:'synthetic-never-log'})};
const run=env=>spawnSync(process.execPath,['native-deployment-guard.cjs'],{env,encoding:'utf8'});
test('native deployment uses its existing custom target, approved billing state and production data without a cron',()=>{
 const result=run(valid);assert.equal(result.status,0);assert.match(result.stdout,/SQUAD_NATIVE_STORE_GUARD PASS/);assert.doesNotMatch(result.stdout+result.stderr,/synthetic-never-log/);
 const native=JSON.parse(readFileSync('vercel.native-store.json'));assert.deepEqual(native.crons,[]);assert.match(native.buildCommand,/^node native-deployment-guard\.cjs && npm run verify:env && npx tsc --noEmit && npm run build$/);
 const web=JSON.parse(readFileSync('vercel.json'));assert.match(web.buildCommand,/^node production-deployment-guard\.cjs/);assert.deepEqual(web.crons,[{path:'/api/cron/signup-notifications',schedule:'0 10 * * *'}]);
});
test('native guard rejects web/other targets, changed purchase access, audit/emulator data and malformed credentials without disclosing values',()=>{
 for(const override of [{VERCEL_ENV:'production'},{VERCEL_TARGET_ENV:'preview'},{VERCEL_TARGET_ENV:undefined},{NEXT_PUBLIC_APP_DISTRIBUTION:'web'},{NATIVE_BILLING_ENABLED:'true'},{NATIVE_BILLING_IOS_ENABLED:'false'},{NATIVE_BILLING_ANDROID_ENABLED:'true'},{SQUAD_SAAS_TAX_PREVIEW:'true'},{QA_VERIFICATION_EMAIL_TRANSPORT:'firebase'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'},{FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'},{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'the-squad-audit-preview',private_key:'synthetic-never-log'})},{FIREBASE_SERVICE_ACCOUNT_JSON:'synthetic-never-log'}]){
  const result=run({...valid,...override});assert.equal(result.status,42,JSON.stringify(Object.keys(override)));assert.match(result.stderr,/GUARD BLOCKED/);assert.doesNotMatch(result.stdout+result.stderr,/synthetic-never-log/);
 }
});
