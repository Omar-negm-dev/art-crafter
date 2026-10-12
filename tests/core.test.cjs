const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');

test('clamp handles bounds and NaN',()=>{assert.equal(C.clamp(110,0,100),100);assert.equal(C.clamp(-4,0,100),0);assert.equal(C.clamp('x',10,20),10);});
test('document dimensions enforce memory limit',()=>{assert.equal(C.validDimensions(1200,800),true);assert.equal(C.validDimensions(0,0),false);assert.equal(C.validDimensions(9000,500),false);assert.equal(C.validDimensions('1200.5',800),false);});
test('filesystem names are safe for exports',()=>{assert.equal(C.safeName('concept/04:*?'), 'concept04');assert.equal(C.safeName(''), 'Untitled');});
test('layer adjustment filters constrain values',()=>{assert.equal(C.filterCss({brightness:20,contrast:-10,saturation:130,blur:3}),'brightness(120%) contrast(90%) saturate(130%) blur(3px)');assert.equal(C.filterCss({brightness:-300,contrast:800,saturation:500,blur:50}),'brightness(10%) contrast(200%) saturate(300%) blur(20px)');});
test('rect selection is direction-independent',()=>{assert.deepEqual(C.rectFromPoints({x:200,y:160},{x:20,y:40}),{x:20,y:40,w:180,h:120});});
test('layer data is clamped and defensively parsed',()=>{const l=C.sanitizeLayerInfo({name:'good',opacity:500,locked:true,filters:{saturation:-100}});assert.equal(l.opacity,100);assert.equal(l.filters.saturation,0);assert.equal(l.locked,true);});
test('reject unsupported image types',()=>{assert.equal(C.supportedImage('image/png'),true);assert.equal(C.supportedImage('image/svg+xml'),false);assert.equal(C.supportedImage('text/html'),false);});
test('application source passes basic integration checks',()=>{const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');for(const id of ['mainCanvas','overlayCanvas','layersList','undoBtn','redoBtn','exportBtn','cropSelectionBtn','rotateLayerBtn','modalBackdrop'])assert.ok(html.includes(`id="${id}"`),id);for(const f of ['function compositeCanvas','function saveProject','function importProject','function snapshot','function cropSelection','function transformLayer'])assert.ok(app.includes(f));});
