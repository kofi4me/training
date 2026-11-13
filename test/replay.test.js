import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReplay} from '../replay.js';
test('replay advances, inspects backward, and never mutates event input',()=>{
 const input=[{message:'source',node:0},{message:'target',node:1}],seen=[];const r=createReplay({onChange:s=>seen.push(s)});
 r.load(input);input[0].message='changed';r.next();assert.equal(r.snapshot().events[0].message,'source');r.next();r.previous();assert.equal(r.snapshot().cursor,0);assert.equal(seen.at(-1).reason,'inspect');r.seek(1);assert.equal(r.snapshot().reason,'snapshot');
 assert.throws(()=>r.seek(2));r.destroy();
});
test('speed reschedules a single timer; pause/resume/restart and destruction cancel timers',()=>{
 let nextId=0;const pending=new Map(),delays=[];
 const schedule=(fn,ms)=>{const id=++nextId;pending.set(id,fn);delays.push(ms);return id;};const cancel=id=>pending.delete(id);
 const r=createReplay({delay:1000,schedule,cancel});r.load(['one','two','three']);r.play();assert.equal(r.snapshot().cursor,0);assert.equal(pending.size,1);
 r.setSpeed(2);assert.equal(pending.size,1);assert.equal(delays.at(-1),500);r.pause();assert.equal(pending.size,0);r.play();assert.equal(r.snapshot().cursor,1);
 [...pending.values()][0]();assert.equal(r.snapshot().cursor,2);assert.equal(r.snapshot().running,false);assert.equal(pending.size,0);
 r.play();assert.equal(r.snapshot().cursor,0);r.destroy();assert.equal(pending.size,0);r.next();assert.equal(r.snapshot().cursor,0);
 assert.throws(()=>r.setSpeed(3));
});
