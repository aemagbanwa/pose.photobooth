const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../gallery/app.js'),'utf8');
const fn=source.slice(source.indexOf('  async function downloadCurrentAlbum()'),source.indexOf('  async function unlockPendingEvent()'));
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';}
 append(...children){this.children.push(...children);}
 setAttribute(){} removeAttribute(){} remove(){this.removed=true;}
 addEventListener(name,fn){this.events[name]=fn;}
 querySelector(){return this.label;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
 replaceChildren(...children){this.children=children;}
 showModal(){} close(){this.events.close();}
 click(){return this.events.click();}
}
(async()=>{
const body=new Element('body'),button=new Element('button');button.label=new Element('span');let requests=[];
const context={state:{currentCollection:{id:'album',accessPin:'1234',downloadsEnabled:true}},els:{albumDownload:button},config:{endpoint:'https://example.com/exec'},document:{body,createElement:t=>new Element(t)},AbortController,Blob,Uint8Array,atob,URL,clientKey:()=> 'client',setTimeout:()=>{},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({ok:true,albumZip:requests.length===1?{title:'Album',partCount:1,fileCount:2,signature:'abc'}:{name:'Album.zip',data:'UEs=',fileCount:2}})}}};
vm.createContext(context);vm.runInContext(fn,context);await context.downloadCurrentAlbum();await new Promise(setImmediate);
assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('pin'),'1234');assert.equal(requests[1].searchParams.get('zipSignature'),'abc');
assert.equal(body.children.length,1);assert.equal(body.children[0].querySelectorAll('a')[0].download,'Album.zip');
await context.downloadCurrentAlbum();assert.equal(body.children.length,1);
body.children[0].close();assert.equal(button.disabled,false);assert.equal(context.state.albumZipBusy,false);
context.fetch=async()=>({ok:true,json:async()=>({ok:true,event:{}})});await context.downloadCurrentAlbum();assert(body.children[1].children[1].textContent.includes('updated Google Apps Script'));body.children[1].close();
console.log('PASS: ZIP dialog, protected requests, save link, duplicate-click guard, cleanup, old-backend error.');
})().catch(e=>{console.error(e);process.exitCode=1});
