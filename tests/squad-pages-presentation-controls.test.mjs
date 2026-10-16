import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import{build}from'esbuild';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const b=await build({stdin:{contents:`export * from './src/lib/squad-pages/model';export {PageView} from './src/components/squad-pages/page-view';export {renderToStaticMarkup} from 'react-dom/server';export {createElement} from 'react';`,resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',jsx:'automatic',alias:{'@':root+'/src'},plugins:[{name:'style-names',setup(x){x.onLoad({filter:/\.module\.css$/},()=>({contents:'export default new Proxy({}, {get:(_,key)=>String(key)})',loader:'js'}))}}]});
// React's server renderer uses CommonJS node dependencies; provide node require explicitly.
const {createRequire}=await import('node:module');globalThis.__presentationRequire=createRequire(import.meta.url);
const code='const require=globalThis.__presentationRequire;\n'+b.outputFiles[0].text;const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const context={forms:[],directory:[]},images=p=>'https://example.com/image?id='+p.id;
function content(){return m.emptyContent('Test team')};function html(c){return m.renderToStaticMarkup(m.createElement(m.PageView,{content:c,context,images}))}
test('legacy pages retain all field values and new presentation settings stay optional',()=>{const c=content();c.about='Preserve story';c.primary='#17304a';const normalized=m.validateContent(c);assert.equal(normalized.about,c.about);assert.equal(normalized.background,undefined);assert.equal(normalized.menu,undefined);assert.equal(normalized.galleryLightbox,undefined)});
test('presentation controls roundtrip colors gallery mode lightbox and custom menu',()=>{const c=content();Object.assign(c,{background:'#102a35',galleryLayout:'mosaic',galleryLightbox:false,menu:[{id:'custom',label:'Our story',target:'#section-about',visible:true}]});assert.deepEqual(m.validateContent(c),c)});
test('invalid colors layouts booleans and menu destinations reject server-side',()=>{for(const patch of[{background:'red'},{galleryLayout:'unsafe'},{galleryLightbox:'false'},{menu:[{id:'bad',label:'Bad',target:'javascript:alert(1)',visible:true}]},{menu:[{id:'bad',label:'Bad',target:'#missing-section',visible:true}]},{menu:[{id:'bad',label:'Bad',target:'http://example.com',visible:true}]}])assert.throws(()=>m.validateContent({...content(),...patch}),m.PageError)});
test('header menus normalize valid HTTPS targets and reject duplicate or empty identifiers/titles',()=>{const c=content();c.menu=[{id:'public',label:'Schedule',target:'https://example.com',visible:true}];assert.equal(m.validateContent(c).menu[0].target,'https://example.com/');c.menu.push({...c.menu[0]});assert.throws(()=>m.validateContent(c));c.menu=[{id:'x',label:'',target:'#page-top',visible:true}];assert.throws(()=>m.validateContent(c));});
test('registration and link-dependent sections hide without destinations while source copy remains',()=>{const c=content();c.joinHeading='Keep join heading';c.joinText='Retained join body';c.joinImage={id:'photo',alt:'Court',caption:'',x:25,y:75,overlay:.6};const out=html(c);assert.ok(!out.includes('id="section-registration"'));assert.ok(!out.includes('id="section-links"'));assert.equal(c.joinText,'Retained join body');assert.equal(c.joinImage.x,25);});
test('linked registration section appears and no active form exposes a stale selected private reference',()=>{const c=content();c.registrations=[{id:'external',label:'Register',url:'https://example.com/register'}];assert.ok(html(c).includes('id="section-registration"'));c.registrations=[{id:'missing',formId:'private',label:'Private form',url:'/register/league/foreign?protocol=private'}];assert.ok(!html(c).includes('Private form'));assert.ok(!html(c).includes('id="section-registration"'));});
test('custom menu respects section visibility and optional gallery lightbox creates no false buttons',()=>{const c=content();c.about='Public story';c.menu=[{id:'story',label:'Our story',target:'#section-about',visible:true},{id:'hidden',label:'Hidden registration',target:'#section-registration',visible:true}];c.gallery=[{id:'photo',alt:'Court',caption:'Caption',x:22,y:73,overlay:.6}];c.galleryLightbox=false;c.galleryLayout='staggered';const out=html(c);assert.ok(out.includes('Our story'));assert.ok(!out.includes('Hidden registration'));assert.ok(!out.includes('aria-label="Open image'));assert.ok(out.includes('gallerystaggered'));assert.ok(out.includes('object-position:22% 73%'));});

test('linked sponsor logos retain an accessible destination label without forcing content changes',()=>{const c=content();c.sponsors=[{name:'',image:{id:'logo',alt:'Fictional sponsor',caption:'',x:50,y:50,overlay:0},url:'https://example.com/sponsor'}];const out=html(c);assert.ok(out.includes('Fictional sponsor<svg'));assert.equal(c.sponsors[0].name,'');});

test('header button keeps legacy automatic registration and supports safe custom label destination visibility',()=>{
 const c=content();c.registrations=[{id:'join',label:'Register now',url:'https://example.com/register'}];
 assert.equal(m.validateContent(c).headerButton,undefined);assert.match(html(c),/class="headerAction"[^]*?Register now/);
 c.headerButton={label:'Meet our team',target:'#section-about',visible:true};c.about='Our story';
 assert.deepEqual(m.validateContent(c).headerButton,c.headerButton);assert.match(html(c),/class="headerAction"[^]*?href="#section-about"[^]*?Meet our team/);
 c.headerButton.visible=false;assert.ok(!html(c).includes('class="headerAction"'));
 c.headerButton={label:'Schedule',target:'https://example.com',visible:true};assert.equal(m.validateContent(c).headerButton.target,'https://example.com/');
});
test('header button rejects unsafe or private destinations and does not expose empty section targets',()=>{
 for(const patch of [{label:'',target:'#page-top',visible:true},{label:'Click',target:'javascript:alert(1)',visible:true},{label:'Click',target:'http://example.com',visible:true},{label:'Click',target:'/register/league/private',visible:true},{label:'Click',target:'#missing',visible:true},{label:'Click',target:'#page-top',visible:'true'}])assert.throws(()=>m.validateContent({...content(),headerButton:patch}),m.PageError);
 const c=content();c.headerButton={label:'Join',target:'#section-registration',visible:true};assert.ok(!html(c).includes('class="headerAction"'));
});
test('every photo position survives normalization and all templates and gallery layouts apply the per-image position',()=>{
 for(const template of ['simple','modern','bold'])for(const galleryLayout of ['row','mosaic','staggered']){
 const c=content();Object.assign(c,{template,galleryLayout,about:'About',registrations:[{id:'join',label:'Join',url:'https://example.com/register'}]});
 const photo=(id,x,y)=>({id,alt:id,caption:'',x,y,overlay:.2});c.hero=photo('hero',11,22);c.aboutImage=photo('about',33,44);c.joinImage=photo('join',55,66);c.gallery=[photo('gallery',77,88)];
 const saved=m.validateContent(JSON.parse(JSON.stringify(c)));assert.deepEqual(saved.gallery,c.gallery);const out=html(saved);
 for(const coordinates of ['11% 22%','33% 44%','55% 66%','77% 88%'])assert.ok(out.includes('object-position:'+coordinates),template+' '+galleryLayout+' '+coordinates);
 }
});
test('per-image frame size and crop zoom roundtrip with legacy defaults and reject invalid settings',()=>{
 const c=content();c.hero={id:'hero',alt:'Hero',caption:'',x:20,y:80,overlay:.2,size:120,zoom:150};const normalized=m.validateContent(c);assert.deepEqual(normalized.hero,c.hero);assert.match(html(normalized),/scale:1.5/);assert.match(html(normalized),/--photo-size:1.2/);
 for(const patch of [{size:69},{size:131},{size:'100'},{zoom:99},{zoom:201},{zoom:Infinity},{zoom:NaN}])assert.throws(()=>m.validateContent({...c,hero:{...c.hero,...patch}}),m.PageError);
 delete c.hero.size;delete c.hero.zoom;assert.deepEqual(m.validateContent(c).hero,c.hero);
 c.logo={...c.hero,size:130,zoom:200};const out=html(c);assert.match(out,/logoImage[^]*?object-position:center/);assert.ok(!out.match(/logoImage[^>]*scale:/));
});
