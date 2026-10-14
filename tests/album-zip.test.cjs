const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const ctx = { console, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '../backend/pose-gallery.gs'), 'utf8'), ctx);
let files, settings, zipped, reads;
function file(id, size, name = '../same.jpg', mime = 'image/jpeg') {
  return { getId: () => id, getSize: () => size, getName: () => name, getMimeType: () => mime,
    getLastUpdated: () => new Date('2026-10-13'), getBlob: () => { reads++; return { setName(name) { return { name, id }; } }; } };
}
const folder = { getName: () => 'Test album', getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; } };
Object.assign(ctx, {
  jsonResponse_: x => x, isEventFolder_: id => id === 'album', DriveApp: { getFolderById: () => folder },
  settingsFor_: () => settings, pinRateState_: () => ({ blockedUntil: 0 }), hashPin_: x => x,
  secureEquals_: (a,b) => a === b, clearPinFailures_: () => {}, recordPinFailure_: () => ({ blockedUntil: 0 }),
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, text) => crypto.createHash('sha256').update(text).digest(),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'), base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    zip: (blobs, name) => { zipped = { blobs, name }; return { getBytes: () => [80,75] }; } }
});
function reset() { files = [file('a', 12*1048576), file('b', 12*1048576)]; settings = { configured: true, published: true, downloadsEnabled: true, pinEnabled: true, pinHash: '1234' }; zipped = null; reads = 0; }
const call = (extra = {}, pin = '1234', id = 'album') => ctx.unlockEvent_(id, pin, { albumZip: '1', ...extra });
reset(); assert.equal(call({}, 'wrong').code, 'INVALID_PIN'); assert.equal(reads,0);
assert.equal(call({}, '1234','other').code,'EVENT_NOT_FOUND');
settings.published = false; assert(!call().ok); settings.published = true;
settings.expires = '2000-01-01'; assert(!call().ok); delete settings.expires;
settings.downloadsEnabled = false; assert(!call().ok); settings.downloadsEnabled = true;
let manifest = call().albumZip; assert.equal(manifest.partCount,2); assert.equal(manifest.fileCount,2); assert.equal(reads,0);
let r=call({zipPart:0, zipSignature:manifest.signature}); assert(r.ok); assert.equal(zipped.blobs.length,1); assert(zipped.name.endsWith('-part-1-of-2.zip')); assert(!zipped.blobs[0].name.includes('/'));
assert(!call({zipPart:2,zipSignature:manifest.signature}).ok);
files.push(file('c', 1)); assert(!call({zipPart:1,zipSignature:manifest.signature}).ok);
reset(); files=[file('a',1),file('b',1)]; manifest=call().albumZip; assert.equal(manifest.partCount,1); call({zipPart:0,zipSignature:manifest.signature}); assert.notEqual(zipped.blobs[0].name,zipped.blobs[1].name);
reset(); files=[file('a',21*1048576)]; assert(!call().ok); assert.equal(reads,0);
reset(); files=[]; assert(!call().ok);
reset(); files=Array.from({length:81},(_,i)=>file(String(i),1)); assert.equal(call().albumZip.partCount,3);
console.log('PASS: ZIP access controls, complete manifest, bounded parts, duplicate/safe names, changed-album rejection, empty/oversize handling.');
