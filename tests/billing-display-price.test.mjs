import assert from 'node:assert/strict';
import test from 'node:test';
import {displayPriceFromStripe,isFreshDisplayPrice,validStoreDisplayQuote,sameStoreDisplayQuote,DISPLAY_PRICE_MAX_AGE_MS} from '../src/lib/billing-display-price.ts';
const now=Date.now();
const stripe={id:'price_local',active:true,currency:'cad',unit_amount:12999,recurring:{interval:'month',interval_count:1}};
test('web price uses actual catalog currency with explicit code, without converting it',()=>{
 const quote=displayPriceFromStripe(stripe,now);assert.equal(quote.currency,'CAD');assert.equal(quote.amount,129.99);assert.equal(quote.formatted,'CAD 129.99');
 assert.equal(displayPriceFromStripe({...stripe,currency:'usd'},now).formatted,'USD 129.99');
});
test('loading, missing, future and expired quotes cannot enable price display',()=>{
 const quote=displayPriceFromStripe(stripe,now);
 assert.equal(isFreshDisplayPrice(undefined,now),false);assert.equal(isFreshDisplayPrice(quote,now),true);
 assert.equal(isFreshDisplayPrice(quote,now+DISPLAY_PRICE_MAX_AGE_MS),false);assert.equal(isFreshDisplayPrice({...quote,fetchedAt:now+1},now),false);
});
test('invalid, inactive or unsupported recurring catalog data has no fallback price',()=>{
 for(const change of [{active:false},{unit_amount:null},{unit_amount:-1},{currency:'$'},{recurring:null},{recurring:{interval:'week',interval_count:1}},{recurring:{interval:'month',interval_count:2}}])assert.equal(displayPriceFromStripe({...stripe,...change},now),null);
});
const store={productId:'pro.thesquad.team.monthly',price:'$129.99',currencyCode:'CAD',priceAmount:'129.99',period:'P1M'};
test('native requires localized amount and explicit store currency; old bridge blocks',()=>{
 assert.equal(validStoreDisplayQuote(store),true);
 for(const change of [{currencyCode:undefined},{currencyCode:'$'},{price:''},{priceAmount:undefined},{priceAmount:'NaN'},{priceAmount:'0'},{period:'P1W'}])assert.equal(validStoreDisplayQuote({...store,...change}),false);
});
test('purchase preflight detects region/currency, amount, formatting, product and period changes',()=>{
 assert.equal(sameStoreDisplayQuote(store,{...store}),true);
 for(const change of [{currencyCode:'USD'},{priceAmount:'99'},{price:'US$99'},{productId:'pro.thesquad.team.annual'},{period:'P1Y'}])assert.equal(sameStoreDisplayQuote(store,{...store,...change}),false);
});

test('web USD checkout uses only existing USD currency option, never a conversion rate',()=>{
 const multi={...stripe,currency_options:{usd:{unit_amount:9999}}};
 assert.equal(displayPriceFromStripe(multi,now,'usd').formatted,'USD 99.99');
 assert.equal(displayPriceFromStripe(stripe,now,'usd').currency,'CAD');
 assert.equal(displayPriceFromStripe({...multi,currency_options:{usd:{unit_amount:null}}},now,'usd'),null);
});
