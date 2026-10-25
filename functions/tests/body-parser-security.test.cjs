const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('compressed trailing bytes cannot crash parser and normal JSON remains usable', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const http=require('node:http'), assert=require('node:assert/strict');
    const {gzipSync}=require('node:zlib');
    const express=require('express'), parser=require('body-parser');
    const app=express();app.use(parser.json());app.post('/',(req,res)=>res.json(req.body));
    app.use((error,req,res,next)=>res.status(error.status||400).end());
    const server=app.listen(0,'127.0.0.1',async()=>{
      function post(body,encoding){return new Promise((resolve,reject)=>{
        const headers={'Content-Type':'application/json','Content-Length':body.length};
        if(encoding)headers['Content-Encoding']=encoding;
        const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/',method:'POST',headers},res=>{
          let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data}));
        });req.setTimeout(2000,()=>req.destroy(new Error('fixture timeout')));req.on('error',reject);req.end(body);
      });}
      try{
        const frame=gzipSync(Buffer.from('{"fixture":true}'));
        await post(Buffer.concat([frame,Buffer.from([0xff,0x00,0x01,0x02])]),'gzip').catch(()=>{});
        await new Promise(resolve=>setTimeout(resolve,100));
        const good=await post(Buffer.from('{"fixture":true}'));
        assert.equal(good.status,200);assert.deepEqual(JSON.parse(good.data),{fixture:true});
      }catch(error){console.error(error.message);process.exitCode=1;}
      finally{server.closeAllConnections();server.close();}
    });
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 8000 });
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
});
