const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../backend/pose-gallery.gs'),'utf8'),ctx);
const headers=vm.runInContext('CONFIG_HEADERS',ctx);let cfg,index,scans,clears;
function sheet(rows){return {getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getRange(r,c,n=1,w=1){return {getValues:()=>Array.from({length:n},(_,i)=>rows[r-1+i].slice(c-1,c-1+w)),getDisplayValues(){return this.getValues().map(a=>a.map(String))},getValue(){return this.getValues()[0][0]},getDisplayValue(){return String(this.getValue()||'')},setValues(v){v.forEach((a,i)=>a.forEach((x,j)=>rows[r-1+i][c-1+j]=x))}}}}}
function reset(configured='old',indexed='old'){
 cfg=[headers.slice(),headers.map(()=> '')];const values={'Folder ID':'album','Event Name':'Test','PIN Enabled':false,'Downloads Enabled':true,'Published':true,'Cover File ID':configured};for(const [k,v] of Object.entries(values))cfg[1][headers.indexOf(k)]=v;
 index=[Array(11).fill(''),['album','test','Test','2026-10-10','birthday',2,2,0,indexed,'url-'+indexed,'']];scans=clears=0;
 Object.assign(ctx,{adminTokenValid_:()=>true,configSpreadsheet_:()=>({getSheetByName:n=>sheet(n==='Events'?cfg:index)}),configColumnMap_:()=>Object.fromEntries(headers.map((x,i)=>[x,i+1])),checkboxValue_:Boolean,dateValue_:x=>x||'',normalizeEventType_:x=>x,jsonResponse_:x=>x,clearGalleryCache_:()=>{clears++},SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},DriveApp:{getFolderById:()=>({})},readMedia_:()=>{scans++;return [{id:'auto',name:'cover_photo.jpg',mediaType:'image'},{id:'new',name:'new.jpg',mediaType:'image'},{id:'old',name:'old.jpg',mediaType:'image'}]}});
}
function save(cover){return ctx.adminUpdateEvent_({eventId:'album',eventName:'Test',eventType:'birthday',coverFileId:cover,pinEnabled:false,published:true,downloadsEnabled:true})}
reset();let r=save('https://drive.google.com/file/d/new/view?usp=sharing');assert(r.ok);assert.equal(index[1][8],'new');assert.equal(r.event.coverUrl,index[1][9]);assert.equal(cfg[1][7],'new');assert.equal(clears,1);
reset('new','old');assert(save('new').ok);assert.equal(index[1][8],'new');
reset('new','new');assert(save('').ok);assert.equal(cfg[1][7],'');assert.equal(index[1][8],'auto');
reset();r=save('outside');assert.equal(r.code,'INVALID_COVER');assert.equal(cfg[1][7],'old');assert.equal(index[1][8],'old');
reset();assert(save('old').ok);assert.equal(scans,0);
assert.equal(ctx.normalizeCoverFileId_('https://drive.google.com/open?id=new'),'new');assert.throws(()=>ctx.normalizeCoverFileId_('https://example.com/file/d/new'));
console.log('PASS: cover link save updates index and response; stale index repair; clear to automatic; invalid file rejection before writes; unchanged cover skips Drive scan.');
