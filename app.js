/* Art Crafter — standalone, layer-based raster image editor. No tracking, upload, or server required. */
(() => {
  'use strict';
  const C = window.ArtCrafterCore;
  const $ = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  const qsa = selector => [...document.querySelectorAll(selector)];
  const tools = {move:'Move layer',select:'Marquee select',brush:'Paint brush',eraser:'Eraser',eyedropper:'Eyedropper',rectangle:'Rectangle',ellipse:'Ellipse',line:'Line',text:'Text',hand:'Pan canvas'};
  const state = {name:'Untitled canvas',width:1200,height:800,layers:[],selected:null,tool:'move',color:'#f17256',size:18,fill:false,font:'Arial',zoom:1,selection:null,drag:null,keyboardSpace:false,clip:null,history:[],historyIndex:-1,loading:false,changes:0};
  const main = $('mainCanvas'), overlay = $('overlayCanvas'), ctx = main.getContext('2d'), octx = overlay.getContext('2d');
  let toastTimer, adjustBefore = null;
  const uid = () => 'layer_' + Math.random().toString(36).slice(2,10);
  const selected = () => state.layers.find(l=>l.id===state.selected) || null;
  const makeCanvas = (w=state.width,h=state.height) => {const x=document.createElement('canvas');x.width=w;x.height=h;return x;};
  function makeLayer(name='Untitled layer') {return {...C.sanitizeLayerInfo({id:uid(),name}),canvas:makeCanvas()};}
  function drawAll(){
    main.width=state.width;main.height=state.height;overlay.width=state.width;overlay.height=state.height;
    ctx.clearRect(0,0,state.width,state.height);
    state.layers.forEach(l=>{if(!l.visible || l.opacity<=0)return;ctx.save();ctx.globalAlpha=l.opacity/100;ctx.filter=C.filterCss(l.filters);ctx.drawImage(l.canvas,l.x,l.y);ctx.restore();});
    drawOverlay();
    $('docInfo').textContent=state.width+' × '+state.height+' px';
    $('docDimensions').textContent=state.width+' × '+state.height;
    $('layerCount').textContent=state.layers.length+' layer'+(state.layers.length!==1?'s':'');
  }
  function drawOverlay(point=null){
    octx.clearRect(0,0,state.width,state.height);
    let s=state.selection;
    if(state.drag && state.drag.tool==='select')s=C.rectFromPoints(state.drag.start,state.drag.current);
    if(s && s.w>0 && s.h>0){octx.save();octx.lineWidth=1.4/state.zoom;octx.setLineDash([6/state.zoom,4/state.zoom]);octx.strokeStyle='#111c30';octx.strokeRect(s.x+.5,s.y+.5,s.w,s.h);octx.lineDashOffset=5/state.zoom;octx.strokeStyle='#fff';octx.strokeRect(s.x+.5,s.y+.5,s.w,s.h);octx.restore();}
    if(state.drag && ['rectangle','ellipse','line'].includes(state.drag.tool)){
      const tmp=state.drag;drawShape(octx,tmp.tool,tmp.start,tmp.current, true);
    }
    if(point && ['brush','eraser'].includes(state.tool)){octx.save();octx.strokeStyle=state.tool==='eraser'?'#252c38':state.color;octx.lineWidth=Math.max(1,1/state.zoom);octx.beginPath();octx.arc(point.x,point.y,state.size/2,0,2*Math.PI);octx.stroke();octx.restore();}
  }
  function layerDraw(l){const x=l.canvas.getContext('2d');return x;}
  function drawShape(target, tool, start, end, preview=false){
    target.save();target.lineWidth=state.size;target.lineCap='round';target.lineJoin='round';target.strokeStyle=state.color;target.fillStyle=state.color;
    if(preview) {target.globalAlpha=.8;target.lineWidth=Math.max(1,state.size/state.zoom);target.setLineDash([6/state.zoom,4/state.zoom]);}
    if(!preview && state.selection){let s=state.selection;target.beginPath();target.rect(s.x-selected().x,s.y-selected().y,s.w,s.h);target.clip();}
    const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y),w=Math.abs(end.x-start.x),h=Math.abs(end.y-start.y);
    target.beginPath();
    if(tool==='rectangle')target.rect(x,y,w,h);
    else if(tool==='ellipse')target.ellipse(x+w/2,y+h/2,Math.max(.1,w/2),Math.max(.1,h/2),0,0,Math.PI*2);
    else if(tool==='line'){target.moveTo(start.x,start.y);target.lineTo(end.x,end.y);}
    if(state.fill && tool!=='line')target.fill();else target.stroke();
    target.restore();
  }
  function updateTitle(){ $('docTitle').value=state.name;document.title=state.name+' — Art Crafter';}
  function snapshot(label){
    if(state.loading)return;
    const data={name:state.name,width:state.width,height:state.height,selected:state.selected,layers:state.layers.map(l=>({ ...C.sanitizeLayerInfo(l),image:l.canvas.toDataURL('image/png') }))};
    state.history=state.history.slice(0,state.historyIndex+1);
    state.history.push({label,data});
    if(state.history.length>20)state.history.shift();
    state.historyIndex=state.history.length-1;
    state.changes++;
    $('saveStatus').textContent='Unsaved changes';
    refreshHistory();
    refreshControls();
  }
  async function restore(data){
    state.loading=true;
    try {
      state.width=data.width;state.height=data.height;state.name=data.name;
      const arr=[];
      for(const item of data.layers){const l={...C.sanitizeLayerInfo(item),canvas:makeCanvas(data.width,data.height)};await drawUrl(item.image,l.canvas);arr.push(l);}
      state.layers=arr;state.selected=arr.find(l=>l.id===data.selected)?.id||arr.at(-1)?.id||null;state.selection=null;
      updateTitle();updateBoardSize();drawAll();refreshControls();setTool(state.tool);
    } finally{state.loading=false;}
  }
  function drawUrl(url,canvas){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{canvas.getContext('2d').drawImage(img,0,0);resolve();};img.onerror=()=>reject(new Error('An image could not be loaded.'));img.src=url;});}
  async function undo(){if(state.historyIndex<1)return;state.historyIndex--;await restore(state.history[state.historyIndex].data);refreshHistory();announce('Undid last change');}
  async function redo(){if(state.historyIndex>=state.history.length-1)return;state.historyIndex++;await restore(state.history[state.historyIndex].data);refreshHistory();announce('Redid change');}
  function refreshHistory(){const list=$('historyList');list.replaceChildren();state.history.forEach((entry,i)=>{const div=document.createElement('div');div.className='history-item'+(i===state.historyIndex?' current':'');const a=document.createElement('span');a.textContent=entry.label;const b=document.createElement('small');b.textContent=i===state.historyIndex?'CURRENT':'#'+(i+1);div.append(a,b);list.prepend(div);});$('undoBtn').disabled=state.historyIndex<=0;$('redoBtn').disabled=state.historyIndex===state.history.length-1;}
  function thumbnail(l){const can=makeCanvas(100,90);const t=can.getContext('2d');t.fillStyle='#e5e8eb';t.fillRect(0,0,100,90);t.save();t.globalAlpha=l.opacity/100;t.filter=C.filterCss(l.filters);t.drawImage(l.canvas,l.x*100/state.width,l.y*90/state.height,100,90);t.restore();return can.toDataURL('image/png');}
  function refreshLayers(){
    const list=$('layersList');list.replaceChildren();
    [...state.layers].reverse().forEach(l=>{
      const row=document.createElement('div');row.className='layer-row'+(l.id===state.selected?' active':'');row.role='button';row.tabIndex=0;row.setAttribute('aria-label','Select '+l.name);
      const pic=document.createElement('img');pic.className='layer-thumb';pic.alt='';pic.src=thumbnail(l);
      const content=document.createElement('div');content.className='layer-info';const n=document.createElement('span');n.className='layer-name';n.textContent=l.name;n.title='Double-click to rename';n.addEventListener('dblclick',e=>{e.stopPropagation();renameLayer(l);});
      const sub=document.createElement('span');sub.className='layer-subtitle';sub.textContent=(l.locked?'Locked • ':'Raster • ')+Math.round(l.opacity)+'%';content.append(n,sub);
      const acts=document.createElement('div');acts.className='layer-controls';
      const view=document.createElement('button');view.className='layer-icon-button';view.title=l.visible?'Hide layer':'Show layer';view.setAttribute('aria-label',view.title);view.innerHTML=`<svg><use href="#${l.visible?'i-eye':'i-eye-off'}"/></svg>`;view.onclick=e=>{e.stopPropagation();l.visible=!l.visible;drawAll();refreshLayers();snapshot(l.visible?'Show layer':'Hide layer');};
      const lock=document.createElement('button');lock.className='layer-icon-button';lock.title=l.locked?'Unlock layer':'Lock layer';lock.setAttribute('aria-label',lock.title);lock.innerHTML=`<svg><use href="#${l.locked?'i-lock':'i-unlock'}"/></svg>`;lock.onclick=e=>{e.stopPropagation();l.locked=!l.locked;refreshLayers();snapshot(l.locked?'Lock layer':'Unlock layer');};
      acts.append(view,lock);row.append(pic,content,acts);row.addEventListener('click',()=>{state.selected=l.id;refreshControls();});row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();state.selected=l.id;refreshControls();}});list.append(row);
    });
  }
  function refreshAdjust(){const l=selected();for(const key of ['brightness','contrast','saturation','blur']){const val=l?.filters[key]??C.defaultFilters()[key];$(key+'Input').value=val;$(key+'Val').textContent=val+(key==='saturation'?'%':key==='blur'?'px':'');}$('opacityInput').value=l?.opacity??100;$('opacityVal').textContent=Math.round(l?.opacity??100)+'%';}
  function refreshControls(){refreshLayers();refreshAdjust();$('selectionProperties').hidden=!state.selection; $('saveBtn').disabled=false;}
  function setTool(tool){if(!tools[tool])return;state.tool=tool;qsa('.tool[data-tool]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.tool===tool));$('activeToolLabel').textContent=tools[tool];let hint={move:'Drag to reposition the selected layer',select:'Drag to select an area of the document',brush:'Draw on the active raster layer',eraser:'Erase pixels on the active raster layer',eyedropper:'Click the canvas to sample its color',rectangle:'Drag to draw a rectangle',ellipse:'Drag to draw an ellipse',line:'Drag to draw a line',text:'Click anywhere to add text',hand:'Drag to pan the workspace'};$('canvasHint').textContent=hint[tool];overlay.style.cursor={move:'move',select:'crosshair',brush:'crosshair',eraser:'crosshair',eyedropper:'crosshair',rectangle:'crosshair',ellipse:'crosshair',line:'crosshair',text:'text',hand:'grab'}[tool];drawOverlay();}
  function updateBoardSize(){main.width=overlay.width=state.width;main.height=overlay.height=state.height;let b=$('artboard');b.style.width=Math.round(state.width*state.zoom)+'px';b.style.height=Math.round(state.height*state.zoom)+'px';}
  function setZoom(num,show=true){state.zoom=C.clamp(num,.1,3);updateBoardSize();drawOverlay();$('zoomLabel').textContent=Math.round(state.zoom*100)+'%';if(show)announce('Zoom: '+Math.round(state.zoom*100)+'%');}
  function fit(){const isMobile=window.innerWidth<700;const w=$('workspace').clientWidth-(isMobile?65:170),h=$('workspace').clientHeight-(isMobile?120:170);setZoom(Math.min(1.1,Math.max(.1,Math.min(w/state.width,h/state.height))),false);}
  function announce(message,error=false){$('statusText').textContent=message;const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
  function addLayer(name){const l=makeLayer(name);let i=state.layers.findIndex(x=>x.id===state.selected);state.layers.splice(i+1,0,l);state.selected=l.id;drawAll();refreshControls();snapshot('Add layer');announce('Added '+l.name);return l;}
  function renameLayer(l){openModal('Rename layer',`<div class="field"><label for="renameInput">Layer name</label><input id="renameInput" maxlength="90" required value="${escapeHtml(l.name)}"/></div>`,[{text:'Cancel',action:closeModal},{text:'Rename',primary:true,action:()=>{l.name=C.safeName($('renameInput').value);closeModal();refreshLayers();snapshot('Rename layer');}}]);}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
  function duplicateLayer(){const old=selected();if(!old)return;const l={...C.sanitizeLayerInfo(old),id:uid(),name:old.name+' copy',canvas:makeCanvas()};layerDraw(l).drawImage(old.canvas,0,0);state.layers.splice(state.layers.indexOf(old)+1,0,l);state.selected=l.id;drawAll();refreshControls();snapshot('Duplicate layer');}
  function moveLayer(order){const l=selected();if(!l)return;let i=state.layers.indexOf(l),next=i+order;if(next<0||next>=state.layers.length)return;[state.layers[i],state.layers[next]]=[state.layers[next],state.layers[i]];drawAll();refreshControls();snapshot('Reorder layers');}
  function deleteLayer(){const l=selected();if(!l)return;if(state.layers.length<=1){announce('A document needs at least one layer',true);return;}let idx=state.layers.indexOf(l);state.layers.splice(idx,1);state.selected=state.layers[Math.max(0,idx-1)].id;drawAll();refreshControls();snapshot('Delete layer');}
  function setActiveColor(color){if(!C.validColor(color))return;state.color=color;$('colorInput').value=color;$('colorHex').textContent=color.toUpperCase();}
  function pointFromEvent(ev){const r=overlay.getBoundingClientRect();return {x:C.clamp((ev.clientX-r.left)/r.width*state.width,0,state.width),y:C.clamp((ev.clientY-r.top)/r.height*state.height,0,state.height)};}
  function rawLayerPoint(p,l){return {x:p.x-l.x,y:p.y-l.y};}
  function beginPaint(l,p,eraser=false){const c=layerDraw(l);c.save();c.lineWidth=state.size;c.lineJoin='round';c.lineCap='round';c.strokeStyle=state.color;c.fillStyle=state.color;if(eraser)c.globalCompositeOperation='destination-out';if(state.selection){const s=state.selection;c.beginPath();c.rect(s.x-l.x,s.y-l.y,s.w,s.h);c.clip();}const q=rawLayerPoint(p,l);c.beginPath();c.arc(q.x,q.y,state.size/2,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(q.x,q.y);state.drag.ctx=c;}
  function paintContinue(p){let d=state.drag;if(!d?.ctx)return;const q=rawLayerPoint(p,selected());d.ctx.lineTo(q.x,q.y);d.ctx.stroke();d.ctx.beginPath();d.ctx.moveTo(q.x,q.y);}
  function pointerDown(e){if(e.button!==0 && e.button!==1)return;const point=pointFromEvent(e);const tool=state.keyboardSpace?'hand':state.tool;let l=selected();if(!l && tool!=='hand')return;
    if(tool==='eyedropper'){const px=ctx.getImageData(Math.floor(Math.min(point.x,state.width-1)),Math.floor(Math.min(point.y,state.height-1)),1,1).data;if(px[3]===0){announce('Transparent pixel: no color to sample');return;}setActiveColor('#'+[px[0],px[1],px[2]].map(x=>x.toString(16).padStart(2,'0')).join(''));announce('Color sampled');return;}
    if(tool==='text'){if(l.locked){announce('Unlock this layer to edit',true);return;}textAt(point);return;}
    if(!['select','hand'].includes(tool) && l.locked){announce('Unlock this layer to edit',true);return;}
    e.preventDefault();overlay.setPointerCapture(e.pointerId);state.drag={tool,start:point,current:point,last:point,original:{x:l?.x||0,y:l?.y||0},clientX:e.clientX,clientY:e.clientY,scrollLeft:$('workspace').scrollLeft,scrollTop:$('workspace').scrollTop,moved:false};
    if(tool==='brush'||tool==='eraser')beginPaint(l,point,tool==='eraser');
  }
  function pointerMove(e){const p=pointFromEvent(e);$('cursorPos').textContent='X: '+Math.round(p.x)+'   Y: '+Math.round(p.y);const d=state.drag;
    if(!d){drawOverlay(p);return;}
    d.current=p;if(Math.hypot(p.x-d.start.x,p.y-d.start.y)>1)d.moved=true;
    if(d.tool==='brush'||d.tool==='eraser'){paintContinue(p);drawAll();drawOverlay(p);}
    else if(d.tool==='move'){const l=selected();l.x=Math.round(d.original.x+p.x-d.start.x);l.y=Math.round(d.original.y+p.y-d.start.y);drawAll();}
    else if(d.tool==='hand'){$('workspace').scrollLeft=d.scrollLeft-(e.clientX-d.clientX);$('workspace').scrollTop=d.scrollTop-(e.clientY-d.clientY);}
    else drawOverlay(p);
  }
  function pointerUp(e){const d=state.drag;if(!d)return;const p=pointFromEvent(e);d.current=p;state.drag=null;
    if(d.ctx)d.ctx.restore();
    if(d.tool==='select'){const s=C.rectFromPoints(d.start,p);state.selection=s.w>2&&s.h>2?s:null;refreshControls();drawOverlay();announce(state.selection?`Selected ${s.w} × ${s.h} pixels`:'Selection cleared');return;}
    if(['rectangle','ellipse','line'].includes(d.tool)&&d.moved){const l=selected();const a=rawLayerPoint(d.start,l),b=rawLayerPoint(p,l);drawShape(layerDraw(l),d.tool,a,b);drawAll();refreshControls();snapshot('Draw '+d.tool);return;}
    if(['brush','eraser','move'].includes(d.tool)){drawAll();refreshControls();if(d.tool==='move'&&!d.moved)return;snapshot(d.tool==='move'?'Move layer':d.tool==='brush'?'Brush stroke':'Erase stroke');return;}
    drawOverlay();
  }
  function pointerCancel(){if(state.drag?.ctx)state.drag.ctx.restore();state.drag=null;drawAll();}
  function clearSelection(){state.selection=null;refreshControls();drawOverlay();}
  function deleteSelectedPixels(){const l=selected(),s=state.selection;if(!l||!s)return;if(l.locked){announce('Unlock this layer first',true);return;}layerDraw(l).clearRect(s.x-l.x,s.y-l.y,s.w,s.h);drawAll();refreshControls();snapshot('Delete selected pixels');}
  function compositeCanvas(){const canvas=makeCanvas();const cx=canvas.getContext('2d');state.layers.forEach(l=>{if(!l.visible)return;cx.save();cx.globalAlpha=l.opacity/100;cx.filter=C.filterCss(l.filters);cx.drawImage(l.canvas,l.x,l.y);cx.restore();});return canvas;}
  function copySelection(){if(!state.selection){announce('Select an area first',true);return;}const s=state.selection;const can=makeCanvas(s.w,s.h);can.getContext('2d').drawImage(compositeCanvas(),s.x,s.y,s.w,s.h,0,0,s.w,s.h);state.clip=can.toDataURL('image/png');announce('Copied selection internally (Ctrl+V to paste)');}
  async function pasteSelection(){if(!state.clip){announce('Nothing to paste yet',true);return;}const l=addLayer('Pasted selection');const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=state.clip;});layerDraw(l).drawImage(img,state.selection?.x??Math.round((state.width-img.width)/2),state.selection?.y??Math.round((state.height-img.height)/2));clearSelection();drawAll();refreshControls();snapshot('Paste selection');}
  function cropSelection(){const s=state.selection;if(!s)return;if(s.w<64||s.h<64){announce('Cropped document must be at least 64 × 64',true);return;}for(const l of state.layers){const next=makeCanvas(s.w,s.h);next.getContext('2d').drawImage(l.canvas,l.x-s.x,l.y-s.y);l.canvas=next;l.x=0;l.y=0;}state.width=s.w;state.height=s.h;state.selection=null;updateBoardSize();fit();drawAll();refreshControls();snapshot('Crop document');announce('Document cropped');}
  function transformLayer(kind){
    const l=selected();if(!l)return;if(l.locked){announce('Unlock the selected layer first',true);return;}
    const next=makeCanvas(),n=next.getContext('2d'),w=state.width,h=state.height;
    if(kind==='rotate'){n.translate(w/2,h/2);n.rotate(Math.PI/2);n.drawImage(l.canvas,-w/2,-h/2);}
    else if(kind==='flipH'){n.translate(w,0);n.scale(-1,1);n.drawImage(l.canvas,0,0);}
    else if(kind==='flipV'){n.translate(0,h);n.scale(1,-1);n.drawImage(l.canvas,0,0);}
    l.canvas=next;drawAll();refreshControls();snapshot('Transform layer');announce('Layer transformed');
  }
  function applyPreset(name){const l=selected();if(!l)return;
    const presets={mono:{brightness:0,contrast:18,saturation:0,blur:0},vintage:{brightness:7,contrast:-12,saturation:65,blur:0},pop:{brightness:3,contrast:24,saturation:175,blur:0}};
    if(!presets[name])return;l.filters={...presets[name]};drawAll();refreshControls();snapshot('Apply '+name+' preset');
  }
  function openModal(title,html,buttons=[]){$('modalTitle').textContent=title;$('modalContent').innerHTML=html;const acts=document.createElement('div');acts.className='dialog-actions';buttons.forEach(b=>{const el=document.createElement('button');el.className='dialog-btn'+(b.primary?' primary':'');el.textContent=b.text;el.addEventListener('click',b.action);acts.append(el);});$('modalContent').append(acts);$('modalBackdrop').hidden=false;const first=$('modalContent').querySelector('input,textarea,select');setTimeout(()=>first?.focus(),20);}
  function closeModal(){$('modalBackdrop').hidden=true;$('modalContent').replaceChildren();}
  function textAt(p){openModal('Add text',`<p class="dialog-description">Place styled text on the selected raster layer. Text is converted to pixels after insertion.</p><div class="dialog-grid"><div class="field field-full"><label for="textContent">Text</label><textarea id="textContent" maxlength="500" placeholder="Write your text...">Make something great.</textarea></div><div class="field"><label for="textSize">Font size (px)</label><input id="textSize" type="number" min="8" max="300" value="${Math.max(12,Math.round(state.size*3))}"/></div><div class="field"><label for="textFont">Font family</label><select id="textFont"><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Courier New</option><option>Impact</option></select></div></div>`,[{text:'Cancel',action:closeModal},{text:'Add text',primary:true,action:()=>{const val=$('textContent').value;if(!val.trim())return;const size=C.integer($('textSize').value,8,300),font=$('textFont').value;const layer=selected(),lc=layerDraw(layer);lc.save();lc.font=`700 ${size}px "${font}"`;lc.textBaseline='top';lc.fillStyle=state.color;const line=val.split('\n'),at=rawLayerPoint(p,layer);line.forEach((str,i)=>lc.fillText(str,at.x,at.y+i*size*1.24));lc.restore();closeModal();drawAll();refreshControls();snapshot('Add text');announce('Text added to layer');}}]);$('textFont').value=state.font;}
  function newDocDialog(){openModal('Create document',`<p class="dialog-description">Choose a canvas size to start from scratch. Save your current project before creating a new one.</p><div class="dialog-grid"><div class="field field-full"><label for="newDocName">Document name</label><input id="newDocName" value="Untitled artwork" maxlength="90"/></div><div class="field"><label for="newDocWidth">Width (px)</label><input type="number" id="newDocWidth" min="64" max="4096" value="1200"/></div><div class="field"><label for="newDocHeight">Height (px)</label><input type="number" id="newDocHeight" min="64" max="4096" value="800"/></div></div>`,[{text:'Cancel',action:closeModal},{text:'Create canvas',primary:true,action:()=>{const w=Number($('newDocWidth').value),h=Number($('newDocHeight').value);if(!C.validDimensions(w,h)){announce('Canvas size must be 64–4096 pixels in both directions',true);return;}state.width=w;state.height=h;state.name=C.safeName($('newDocName').value);state.layers=[makeLayer('Background')];state.selected=state.layers[0].id;layerDraw(state.layers[0]).fillStyle='#ffffff';layerDraw(state.layers[0]).fillRect(0,0,w,h);state.selection=null;state.history=[];state.historyIndex=-1;closeModal();updateTitle();fit();drawAll();refreshControls();snapshot('New document');announce('Canvas created');}}]);}
  function resizeDialog(){openModal('Resize canvas',`<p class="dialog-description">The document dimensions will change. Existing layer pixels keep their size; areas outside the new canvas are clipped.</p><div class="dialog-grid"><div class="field"><label for="resizeW">Width (px)</label><input type="number" id="resizeW" min="64" max="4096" value="${state.width}"/></div><div class="field"><label for="resizeH">Height (px)</label><input type="number" id="resizeH" min="64" max="4096" value="${state.height}"/></div></div>`,[{text:'Cancel',action:closeModal},{text:'Apply resize',primary:true,action:()=>{const w=Number($('resizeW').value),h=Number($('resizeH').value);if(!C.validDimensions(w,h)){announce('Canvas size must be 64–4096 pixels',true);return;}if(w===state.width&&h===state.height){closeModal();return;}for(const l of state.layers){const next=makeCanvas(w,h);next.getContext('2d').drawImage(l.canvas,0,0);l.canvas=next;}state.width=w;state.height=h;state.selection=null;closeModal();fit();drawAll();refreshControls();snapshot('Resize canvas');}}]);}
  async function importImage(file){if(!file)return;if(!C.supportedImage(file.type)){announce('Use PNG, JPEG, WEBP or GIF image files',true);return;}if(file.size>30*1024*1024){announce('Image exceeds 30 MB upload limit',true);return;}try{const url=URL.createObjectURL(file);const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});const scale=Math.min(1,state.width/img.width,state.height/img.height),w=img.width*scale,h=img.height*scale;const l=makeLayer(C.safeName(file.name.replace(/\.[^.]+$/,'')));let n=state.layers.findIndex(q=>q.id===state.selected);state.layers.splice(n+1,0,l);state.selected=l.id;layerDraw(l).drawImage(img,(state.width-w)/2,(state.height-h)/2,w,h);URL.revokeObjectURL(url);drawAll();refreshControls();snapshot('Import image');announce('Image imported as a new layer');}catch(e){announce('Could not import image: '+e.message,true);}}
  function saveFile(blob,filename){const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),6000);}
  function saveProject(){const obj={format:'artcrafter',version:1,...state.history[state.historyIndex]?.data};if(!obj.layers){announce('Nothing to save',true);return;}obj.name=state.name;const blob=new Blob([JSON.stringify(obj)],{type:'application/json'});saveFile(blob,C.safeName(state.name)+'.artcrafter.json');$('saveStatus').textContent='Project exported';announce('Editable project file saved');}
  async function importProject(file){if(!file)return;if(file.size>120*1024*1024){announce('Project file exceeds 120 MB limit',true);return;}try{const obj=JSON.parse(await file.text());if(obj.format!=='artcrafter'||!C.validDimensions(obj.width,obj.height)||!Array.isArray(obj.layers)||obj.layers.length<1||obj.layers.length>40||obj.layers.some(l=>!String(l.image||'').startsWith('data:image/png;base64,')||String(l.image).length>75_000_000))throw Error('Invalid or unsupported project');state.history=[];state.historyIndex=-1;await restore({...obj,name:C.safeName(obj.name)});fit();snapshot('Open project');announce('Project loaded successfully');}catch(e){announce('Could not open project: '+e.message,true);}}
  function exportDialog(){openModal('Export artwork',`<p class="dialog-description">Export all visible layers as a flat image. Save a project file if you need editable layers later.</p><div class="dialog-grid"><div class="field field-full"><label for="exportFormat">File type</label><select id="exportFormat"><option value="png">PNG — transparency supported</option><option value="jpeg">JPEG — smaller, opaque</option><option value="webp">WebP — modern format</option></select></div><div class="field field-full"><label for="exportQuality">Quality (JPEG / WebP)</label><input type="range" id="exportQuality" min="50" max="100" value="92"/></div></div>`,[{text:'Cancel',action:closeModal},{text:'Download image',primary:true,action:()=>{const format=$('exportFormat').value,mime=format==='jpeg'?'image/jpeg':format==='webp'?'image/webp':'image/png',quality=Number($('exportQuality').value)/100;let canvas=compositeCanvas();if(format==='jpeg'){const bg=makeCanvas();bg.getContext('2d').fillStyle='#ffffff';bg.getContext('2d').fillRect(0,0,state.width,state.height);bg.getContext('2d').drawImage(canvas,0,0);canvas=bg;}canvas.toBlob(blob=>{if(blob)saveFile(blob,C.safeName(state.name)+'.'+(format==='jpeg'?'jpg':format));else announce('Export failed',true);},mime,quality);closeModal();announce('Artwork export started');}}]);}
  function openDialog(){openModal('Open a file',`<p class="dialog-description">Import a photo into a new layer or restore an editable Art Crafter project.</p><button class="menu-choice" id="modalOpenImage"><svg><use href="#i-photo"/></svg><span><strong>Import image</strong><small>PNG, JPEG, WebP or GIF</small></span></button><button class="menu-choice" id="modalOpenProject"><svg><use href="#i-layers"/></svg><span><strong>Open Art Crafter project</strong><small>Editable layer structure (.artcrafter.json)</small></span></button>`,[]);$('modalOpenImage').onclick=()=>{closeModal();$('imageFile').click();};$('modalOpenProject').onclick=()=>{closeModal();$('projectFile').click();};}
  function mobileMenu(){
    openModal('Workspace menu',`<p class="dialog-description">Document and layer actions</p>
    <button class="menu-choice" id="mobileNew"><svg><use href="#i-plus"/></svg><span><strong>New document</strong><small>Create a blank canvas</small></span></button>
    <button class="menu-choice" id="mobileOpen"><svg><use href="#i-upload"/></svg><span><strong>Open image or project</strong><small>Import from your device</small></span></button>
    <button class="menu-choice" id="mobileSave"><svg><use href="#i-download"/></svg><span><strong>Save editable project</strong><small>Preserve layers and history state</small></span></button>
    <button class="menu-choice" id="mobileLayers"><svg><use href="#i-layers"/></svg><span><strong>Show / hide layer panels</strong><small>Edit layers and adjustments</small></span></button>`,[]);
    $('mobileNew').onclick=()=>{closeModal();newDocDialog();};
    $('mobileOpen').onclick=()=>{closeModal();openDialog();};
    $('mobileSave').onclick=()=>{closeModal();saveProject();};
    $('mobileLayers').onclick=()=>{closeModal();$('sidebar').classList.toggle('mobile-open');};
  }
  function showShortcuts(){const pairs=[['Move','V'],['Marquee select','M'],['Brush','B'],['Eraser','E'],['Eyedropper','I'],['Rectangle','U'],['Ellipse','O'],['Line','L'],['Text','T'],['Hand / pan','H or hold Space'],['Undo / redo','Ctrl+Z / Ctrl+Shift+Z'],['Save editable project','Ctrl+S'],['Open file','Ctrl+O'],['Copy / paste selection','Ctrl+C / Ctrl+V'],['Deselect','Escape'],['Delete selected pixels','Delete']];openModal('Keyboard shortcuts',`<div style="max-height:53vh;overflow:auto"><table class="kbd-table">${pairs.map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('')}</table></div>`,[{text:'Close',action:closeModal}]);}
  function renderDemo(){
    state.name='The creative process';state.width=1200;state.height=800;state.layers=[];
    const bg=makeLayer('Cream canvas');let x=layerDraw(bg);x.fillStyle='#f1eae0';x.fillRect(0,0,1200,800);
    x.strokeStyle='#e3d9ca';x.lineWidth=2;for(let j=0;j<11;j++){x.beginPath();x.moveTo(0,j*80+10);x.lineTo(1200,j*80+10);x.stroke();}
    x.fillStyle='#26322e';x.font='bold 17px Arial';x.fillText('ART CRAFTER   /   CREATIVE STUDIES',70,80);x.textAlign='right';x.fillText('VOL. 001      2026',1130,80);x.textAlign='left';state.layers.push(bg);
    const forms=makeLayer('Editorial collage');x=layerDraw(forms);
    x.save();x.translate(843,420);x.rotate(-.2);x.fillStyle='#e96d54';x.beginPath();x.ellipse(0,0,230,290,0,0,Math.PI*2);x.fill();x.restore();
    x.fillStyle='#eab868';x.fillRect(785,270,314,360);x.fillStyle='#e96d54';x.beginPath();x.arc(830,250,154,0,Math.PI*2);x.fill();
    x.strokeStyle='#2f4c45';x.lineWidth=21;x.beginPath();x.arc(896,473,159,-1.2,Math.PI*1.05);x.stroke();
    x.fillStyle='#c5b9e8';x.beginPath();x.arc(1050,575,90,0,Math.PI*2);x.fill();
    x.fillStyle='#304c45';x.save();x.translate(1020,215);x.rotate(.34);x.fillRect(-65,-100,130,200);x.restore();
    x.strokeStyle='#f1eae0';x.lineWidth=10;x.beginPath();x.moveTo(890,198);x.bezierCurveTo(1073,213,730,477,1055,621);x.stroke();
    x.strokeStyle='#304c45';x.lineWidth=2;x.beginPath();x.moveTo(70,688);x.lineTo(1130,688);x.stroke();state.layers.push(forms);
    const typo=makeLayer('Typography');x=layerDraw(typo);x.fillStyle='#283d38';x.font='900 118px Impact,Arial Black,Arial';x.fillText('MAKE',65,289);x.fillText('YOUR',65,402);x.fillText('MARK.',65,515);
    x.fillStyle='#d35e4d';x.font='bold 22px Arial';x.fillText('A SPACE TO EXPERIMENT,',72,566);x.fillText('CREATE & EXPLORE.',72,596);
    x.fillStyle='#283d38';x.font='bold 16px Arial';x.fillText('01 / INSIDE THE STUDIO',70,740);x.textAlign='right';x.fillText('IMAGINATION IN MOTION  →',1130,740);x.textAlign='left';state.layers.push(typo);
    state.selected=typo.id;state.history=[];state.historyIndex=-1;state.selection=null;updateTitle();fit();drawAll();refreshControls();snapshot('Sample document');$('saveStatus').textContent='Unsaved example';}
  function wire(){
    qsa('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
    qsa('.sidebar-tab').forEach(b=>b.onclick=()=>{qsa('.sidebar-tab').forEach(x=>x.classList.toggle('active',x===b));qsa('.sidebar-content').forEach(p=>p.classList.toggle('panel-visible',p.id==='tab-'+b.dataset.tab));});
    $('colorInput').addEventListener('input',e=>setActiveColor(e.target.value));$('sizeInput').oninput=e=>{state.size=Number(e.target.value);$('sizeValue').textContent=state.size;};$('shapeFill').onchange=e=>state.fill=e.target.checked;$('fontSelect').onchange=e=>state.font=e.target.value;
    $('docTitle').addEventListener('change',e=>{const next=C.safeName(e.target.value);if(next!==state.name){state.name=next;updateTitle();snapshot('Rename document');}});
    $('mobileMenuBtn').onclick=mobileMenu;$('newBtn').onclick=newDocDialog;$('openBtn').onclick=openDialog;$('saveBtn').onclick=saveProject;$('exportBtn').onclick=exportDialog;$('fitBtn').onclick=fit;$('resetZoom').onclick=()=>setZoom(1);$('zoomIn').onclick=()=>setZoom(state.zoom*1.25);$('zoomOut').onclick=()=>setZoom(state.zoom/1.25);
    $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;
    $('addLayerBtn').onclick=()=>addLayer('New layer');$('duplicateLayerBtn').onclick=duplicateLayer;$('layerUpBtn').onclick=()=>moveLayer(1);$('layerDownBtn').onclick=()=>moveLayer(-1);$('deleteLayerBtn').onclick=deleteLayer;
    $('opacityInput').addEventListener('input',e=>{if(!selected())return;selected().opacity=Number(e.target.value);$('opacityVal').textContent=e.target.value+'%';drawAll();});$('opacityInput').addEventListener('change',()=>{refreshLayers();snapshot('Layer opacity');});
    for(const key of ['brightness','contrast','saturation','blur']){
      $(key+'Input').addEventListener('pointerdown',()=>{adjustBefore=selected()?.filters[key];});
      $(key+'Input').addEventListener('input',e=>{const l=selected();if(!l)return;l.filters[key]=Number(e.target.value);$(key+'Val').textContent=e.target.value+(key==='saturation'?'%':key==='blur'?'px':'');drawAll();});
      $(key+'Input').addEventListener('change',()=>{refreshLayers();snapshot('Adjust '+key);adjustBefore=null;});
    }
    $('rotateLayerBtn').onclick=()=>transformLayer('rotate');$('flipHorizontalBtn').onclick=()=>transformLayer('flipH');$('flipVerticalBtn').onclick=()=>transformLayer('flipV');qsa('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
    $('resetAdjustBtn').onclick=()=>{const l=selected();if(!l)return;l.filters=C.defaultFilters();drawAll();refreshControls();snapshot('Reset adjustments');};
    $('resizeBtn').onclick=resizeDialog;$('clearSelectionBtn').onclick=clearSelection;$('cropSelectionBtn').onclick=cropSelection;$('copySelectionBtn').onclick=copySelection;$('deleteSelectionBtn').onclick=deleteSelectedPixels;
    $('shortcutsBtn').onclick=showShortcuts;$('modalClose').onclick=closeModal;$('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))closeModal();};
    $('imageFile').onchange=async e=>{await importImage(e.target.files[0]);e.target.value='';};$('projectFile').onchange=async e=>{await importProject(e.target.files[0]);e.target.value='';};
    overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',pointerUp);overlay.addEventListener('pointercancel',pointerCancel);overlay.addEventListener('pointerleave',()=>{if(!state.drag)drawOverlay();});
    const workspace=$('workspace');workspace.addEventListener('dragover',e=>{e.preventDefault();workspace.classList.add('drop-active');});workspace.addEventListener('dragleave',e=>{if(!workspace.contains(e.relatedTarget))workspace.classList.remove('drop-active');});workspace.addEventListener('drop',async e=>{e.preventDefault();workspace.classList.remove('drop-active');const f=e.dataTransfer.files[0];if(f){if(f.name.endsWith('.artcrafter.json'))await importProject(f);else await importImage(f);}});
    workspace.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(state.zoom*(e.deltaY>0?.9:1.1),false);}}, {passive:false});
    document.addEventListener('paste',async e=>{if(document.activeElement?.matches('input,textarea'))return;const files=[...(e.clipboardData?.items||[])].filter(it=>it.kind==='file'&&it.type.startsWith('image/'));if(files[0]){e.preventDefault();await importImage(files[0].getAsFile());}});
    document.addEventListener('keydown',async e=>{
      const typing=e.target.matches('input,textarea,select')||e.target.isContentEditable;
      if(e.key==='Escape'){if(!$('modalBackdrop').hidden){closeModal();return;}clearSelection();return;}
      if(typing||!$('modalBackdrop').hidden)return;
      const cmd=e.ctrlKey||e.metaKey;
      if(cmd){const k=e.key.toLowerCase();if(['z','y','s','o','n','c','v'].includes(k)){e.preventDefault();if(k==='z'){if(e.shiftKey)await redo();else await undo();}else if(k==='y')await redo();else if(k==='s')saveProject();else if(k==='o')openDialog();else if(k==='n')newDocDialog();else if(k==='c')copySelection();else if(k==='v')await pasteSelection();}return;}
      if(e.code==='Space'){e.preventDefault();state.keyboardSpace=true;overlay.style.cursor='grab';return;}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(state.selection)deleteSelectedPixels();return;}
      const mappings={v:'move',m:'select',b:'brush',e:'eraser',i:'eyedropper',u:'rectangle',o:'ellipse',l:'line',t:'text',h:'hand'};if(mappings[e.key.toLowerCase()])setTool(mappings[e.key.toLowerCase()]);
    });
    document.addEventListener('keyup',e=>{if(e.code==='Space'){state.keyboardSpace=false;setTool(state.tool);}});
    window.addEventListener('resize',()=>{if(window.innerWidth<950)fit();});
    window.addEventListener('beforeunload',e=>{if(state.changes>1){e.preventDefault();e.returnValue='';}});
  }
  wire();setTool('move');requestAnimationFrame(()=>renderDemo());
  window.ArtCrafterTest={state,drawAll,addLayer,setTool,undo,redo,fit,exportImage:compositeCanvas,saveProject,renderDemo};
})();
