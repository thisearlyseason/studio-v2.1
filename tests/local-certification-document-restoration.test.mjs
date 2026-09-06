import test from 'node:test';
import assert from 'node:assert/strict';
import {beforeImageMatches} from '../scripts/qa/certification/local/document-restoration.mjs';
import {Timestamp,GeoPoint} from 'firebase-admin/firestore';
test('before-images compare every field and type without depending on Firestore map key order',()=>{
  const before={id:'owned',nested:{enabled:false,count:2},members:['a','b']};
  assert.equal(beforeImageMatches({members:['a','b'],nested:{count:2,enabled:false},id:'owned'},before),true);
  for(const after of[{...before,extra:true},{...before,nested:{enabled:false,count:'2'}},{...before,members:['b','a']},{...before,nested:{count:2}},{...before,id:'foreign'}])assert.equal(beforeImageMatches(after,before),false);
});
test('before-image equality preserves Timestamp and GeoPoint types and exact values',()=>{
  const before={at:new Timestamp(42,10),location:new GeoPoint(12,34)};
  assert.equal(beforeImageMatches({location:new GeoPoint(12,34),at:new Timestamp(42,10)},before),true);
  assert.equal(beforeImageMatches({...before,at:new Timestamp(42,11)},before),false);
  assert.equal(beforeImageMatches({...before,at:{_seconds:42,_nanoseconds:10}},before),false);
});
