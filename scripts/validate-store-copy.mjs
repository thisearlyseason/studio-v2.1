import fs from 'node:fs';
import assert from 'node:assert/strict';
const directory = 'docs/discovery/store-copy';
const counts = {};
for (const [platform, limits] of Object.entries({apple:{name:30,subtitle:30,keywords:100,promotionalText:170,description:4000},'google-play':{title:30,shortDescription:80,fullDescription:4000}})) {
  const data=JSON.parse(fs.readFileSync(`${directory}/${platform}.json`,'utf8')); counts[platform]={};
  for(const [field,limit] of Object.entries(limits)) {
    const value=data[field]; const count=field==='keywords'?Buffer.byteLength(value,'utf8'):[...value].length;
    assert.ok(count<=limit,`${platform} ${field}: ${count}/${limit}`);
    assert.equal(fs.readFileSync(`${directory}/${platform}-${field}.txt`,'utf8'),value);
    counts[platform][field]={count,unit:field==='keywords'?'UTF-8 bytes':'characters',limit};
  }
  if(platform==='apple') {
    const keywords=data.keywords.split(','); assert.equal(new Set(keywords).size,keywords.length);
    for(const term of keywords) {assert.ok(term.length>2); assert.ok(!`${data.name} ${data.subtitle}`.toLowerCase().includes(term));}
  }
}
assert.deepEqual(JSON.parse(fs.readFileSync(`${directory}/counts.json`,'utf8')),counts);
console.log(JSON.stringify(counts,null,2));
