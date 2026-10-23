'use strict';
// Pure financial helpers. No database writes and no exchange-rate assumptions.
const CENTS=100;
function cents(value) {
  if (typeof value!=='number' && typeof value!=='string') throw new TypeError('Importe inválido');
  const s=String(value).trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s)) throw new RangeError('Importe inválido: usa máximo dos decimales');
  const [whole,fraction='']=s.split('.');
  const n=Number(whole)*CENTS+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(n)) throw new RangeError('Importe fuera de rango');
  return n;
}
function money(n) {return (n/CENTS).toFixed(2);}
function currency(value) {
  if (value!=='USD' && value!=='DOP') throw new RangeError('Moneda no admitida');
  return value;
}
function paymentAmount(payment) {
  const code=currency(payment.currency||'DOP');
  const raw=code==='USD'?payment.amount_usd:payment.amount_dop;
  if (raw===null || raw===undefined) throw new Error('Pago sin importe en su moneda');
  return {code,amount:cents(raw)};
}
// All refunds must be confirmed before inclusion; pending refunds never affect revenue.
function summarize(payments,adjustments=[]) {
  const byId=new Map(),totals={USD:{gross:0,refunds:0,net:0},DOP:{gross:0,refunds:0,net:0}};
  for (const p of payments) {
    if (p.status!=='approved') continue;
    if (!p.id || byId.has(String(p.id))) throw new Error('Pago duplicado o sin ID');
    const v=paymentAmount(p);
    byId.set(String(p.id),v);
    totals[v.code].gross+=v.amount;
  }
  const refundsPerPayment=new Map(),refundIds=new Set();
  for (const a of adjustments) {
    if (a.kind!=='refund' || a.status!=='confirmed') continue;
    if (!a.id || refundIds.has(String(a.id))) throw new Error('Reembolso duplicado o sin ID');
    refundIds.add(String(a.id));
    const payment=byId.get(String(a.payment_id));
    if (!payment) throw new Error('Reembolso sin pago aprobado');
    if (currency(a.currency)!==payment.code) throw new Error('Moneda de reembolso diferente al pago');
    const amount=cents(a.amount);
    if (!amount) throw new Error('Reembolso debe ser positivo');
    const next=(refundsPerPayment.get(String(a.payment_id))||0)+amount;
    if (next>payment.amount) throw new Error('Reembolso supera el pago');
    refundsPerPayment.set(String(a.payment_id),next);
    totals[payment.code].refunds+=amount;
  }
  for (const code of ['USD','DOP']) {
    const t=totals[code];
    t.net=t.gross-t.refunds;
    for (const key of ['gross','refunds','net']) t[key]=money(t[key]);
  }
  return totals;
}
module.exports={cents,money,currency,paymentAmount,summarize};
