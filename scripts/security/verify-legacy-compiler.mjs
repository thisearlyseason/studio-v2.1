import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p));
const hash=(bytes,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(bytes).digest(encoding);
const fail=message=>{throw new Error('Legacy compiler provenance check failed: '+message)};
if(process.versions.node.split('.')[0]!=='24')fail('requires Node24.x');
const manifest=json('vendor/braces-provenance.json');
const pkg=json('package.json');
const lock=json('package-lock.json');
if(pkg.devDependencies.braces!=='file:vendor/braces-3.0.3-squad.1.tgz'||pkg.overrides.braces!=='$braces')fail('unexpected dependency routing');
const entries=Object.entries(lock.packages).filter(([key])=>key.endsWith('/braces'));
if(entries.length!==1)fail('expected exactly one locked braces resolution');
const entry=entries[0][1],tar=read('vendor/braces-3.0.3-squad.1.tgz');
if(entry.resolved!==pkg.devDependencies.braces||entry.version!=='3.0.3-squad.1'||entry.engines?.node!=='24.x')fail('unexpected lock identity');
if(hash(tar)!==manifest.tarballSHA256||'sha512-'+hash(tar,'sha512','base64')!==entry.integrity)fail('tarball integrity mismatch');
const installed=json('node_modules/braces/package.json');
if(installed.version!==entry.version||installed.engines?.node!=='24.x'||installed.private!==true)fail('installed package metadata mismatch');
for(const [file,expected]of Object.entries(manifest.sourceFiles)){
 if(hash(read('vendor/braces-source/'+file))!==expected||hash(read('node_modules/braces/'+file))!==expected)fail('source mismatch: '+file);
}
console.log('Legacy compiler immutable source and lock provenance verified; advisory decision remains separate.');
