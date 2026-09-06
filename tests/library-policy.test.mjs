import assert from 'node:assert/strict';
import test from 'node:test';
import {readLibraryBytes,validateLibraryBytes,sanitizeLibraryFilename} from '../src/lib/library-policy.ts';
const pdf=Buffer.from('%PDF-1.4\nSynthetic\n%%EOF\n');
test('Library rejects spoofed active content but accepts supported PDF signature',()=>{
  assert.doesNotThrow(()=>validateLibraryBytes(pdf,'application/pdf'));
  for(const type of ['application/pdf','image/png','image/svg+xml','application/x-msdownload'])assert.throws(()=>validateLibraryBytes(Buffer.from('<script>bad</script>'),type));
});
test('Library reads exact 10MiB and rejects streamed boundary plus one without trusting length headers',async()=>{
  for(const [length,allowed]of[[10*1024*1024,true],[10*1024*1024+1,false]]){
    const req=new Request('http://127.0.0.1/upload',{method:'POST',body:Buffer.alloc(length)});
    if(allowed)assert.equal((await readLibraryBytes(req)).length,length);else await assert.rejects(()=>readLibraryBytes(req),/large/);
  }
});
test('Library attachment filename strips path and control characters',()=>{
  assert.equal(sanitizeLibraryFilename('../../ Squad\r\n"file.pdf'),'Squad__file.pdf');
});
