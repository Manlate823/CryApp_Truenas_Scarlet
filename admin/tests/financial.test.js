'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {summarize,cents}=require('../financial');
const p=(id,amount,currency='USD')=>({id,status:'approved',currency,amount_usd:currency==='USD'?amount:null,amount_dop:currency==='DOP'?amount:null});
test('USD and historical DOP stay separate',()=>{
 const t=summarize([p('1','12.50'),p('2','299.00','DOP')]);
 assert.equal(t.USD.net,'12.50');assert.equal(t.DOP.net,'299.00');
});
test('cancellation alone never subtracts income',()=>{
 const t=summarize([p('1','10.00')],[{id:'c',kind:'cancellation_adjustment',status:'confirmed',payment_id:'1',currency:'USD',amount:'10.00'}]);
 assert.equal(t.USD.net,'10.00');
});
test('only confirmed refunds reduce net revenue',()=>{
 const t=summarize([p('1','10.00')],[{id:'r0',kind:'refund',status:'pending',payment_id:'1',currency:'USD',amount:'3.00'},{id:'r1',kind:'refund',status:'confirmed',payment_id:'1',currency:'USD',amount:'4.00'}]);
 assert.deepEqual(t.USD,{gross:'10.00',refunds:'4.00',net:'6.00'});
});
test('reject over-refunding',()=>assert.throws(()=>summarize([p('1','5.00')],[{id:'r1',kind:'refund',status:'confirmed',payment_id:'1',currency:'USD',amount:'6.00'}])));
test('reject mixed currency refund',()=>assert.throws(()=>summarize([p('1','5.00')],[{id:'r1',kind:'refund',status:'confirmed',payment_id:'1',currency:'DOP',amount:'2.00'}])));
test('reject excess decimals',()=>assert.throws(()=>cents('2.999')));
test('reject duplicate refunds',()=>assert.throws(()=>summarize([p('1','5.00')],[{id:'r1',kind:'refund',status:'confirmed',payment_id:'1',currency:'USD',amount:'1.00'},{id:'r1',kind:'refund',status:'confirmed',payment_id:'1',currency:'USD',amount:'1.00'}])));
