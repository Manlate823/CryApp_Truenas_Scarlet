'use strict';
const jwt=require('jsonwebtoken');
const {randomUUID}=require('crypto');
const UUID=/^[0-9a-f-]{36}$/i;
module.exports=function(pool){
 let initialized;
 const init=()=>initialized ||= (async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS cryapp_module_records (id uuid PRIMARY KEY, owner_id uuid NOT NULL, module text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS cryapp_module_records_lookup ON cryapp_module_records(module,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cryapp_presence (user_id uuid PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now())`);
 })().catch(e=>{initialized=null;throw e});
 const send=(r,c,o)=>{r.writeHead(c,{'Content-Type':'application/json; charset=utf-8'});r.end(JSON.stringify(o))};
 const body=async req=>{let a=[],n=0;for await(const b of req){n+=b.length;if(n>200000)throw Error('Solicitud demasiado grande');a.push(b)}return JSON.parse(Buffer.concat(a).toString()||'{}')};
 return async(req,res)=>{try{
  const m=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'');if(!m||!process.env.JWT_SECRET)return send(res,401,{error:'Sesión requerida'});
  let user;try{user=jwt.verify(m[1],process.env.JWT_SECRET,{algorithms:['HS256']})}catch{return send(res,401,{error:'Sesión inválida'})}
  const uid=user.sub;if(!UUID.test(uid))return send(res,401,{error:'Usuario inválido'});
  await init();const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);const mod=parts[2],id=parts[3];
  if(mod==='stats'&&req.method==='GET'){
   const r=await pool.query("SELECT payload->>'result' AS result FROM cryapp_module_records WHERE module='events' AND owner_id=$1",[uid]);const results=r.rows.map(x=>x.result||'');const wins=results.filter(x=>/victoria/i.test(x)).length,losses=results.filter(x=>/derrota/i.test(x)).length,draws=results.filter(x=>/empate/i.test(x)).length;
   return send(res,200,{ok:true,wins,losses,draws,total:results.length,effectiveness:results.length?Math.round(wins/results.length*100):0});
  }
  if(mod==='presence'&&req.method==='POST'){await pool.query('INSERT INTO cryapp_presence(user_id,last_seen) VALUES($1,now()) ON CONFLICT(user_id) DO UPDATE SET last_seen=now()',[uid]);return send(res,200,{ok:true});}
  if(mod==='contacts'&&req.method==='GET'){
   const r=await pool.query("SELECT u.id,u.nombre,u.correo,u.foto,u.criadero,(p.last_seen>now()-interval '45 seconds') AS online FROM usuarios u LEFT JOIN cryapp_presence p ON p.user_id=u.id WHERE u.id<>$1 ORDER BY u.nombre LIMIT 200",[uid]);return send(res,200,{ok:true,items:r.rows.map(x=>({userId:x.id,name:x.nombre,email:x.correo,farmName:x.criadero||"",photoUrl:x.foto||"",online:x.online===true,unread:0}))});
  }
  if(mod==='thread'&&req.method==='GET'&&UUID.test(id||'')){
   const r=await pool.query("SELECT id,owner_id,payload,created_at FROM cryapp_module_records WHERE module='messages' AND ((owner_id=$1 AND payload->>'recipientId'=$2) OR (owner_id=$2::uuid AND payload->>'recipientId'=$3)) ORDER BY created_at ASC LIMIT 500",[uid,id,uid]);return send(res,200,{ok:true,items:r.rows.map(x=>({messageId:x.id,senderId:x.owner_id,text:x.payload.text,createdAt:x.created_at,status:'SENT'}))});
  }
  if(mod==='read'&&req.method==='POST')return send(res,200,{ok:true});
  const allowed=['events','market','messages'];if(!allowed.includes(mod))return send(res,404,{error:'Módulo no implementado'});
  if(req.method==='GET'&&!id){const r=await pool.query('SELECT id,owner_id,payload,created_at FROM cryapp_module_records WHERE module=$1 AND ($1=$2 OR owner_id=$3) ORDER BY created_at DESC LIMIT 500',[mod,'market',uid]);return send(res,200,{ok:true,items:r.rows.map(x=>({...x.payload,[mod==='events'?'eventId':mod==='market'?'listingId':'messageId']:x.id,userId:x.owner_id,createdAt:x.created_at}))})}
  if(req.method==='POST'&&!id){const b=await body(req);const item=mod==='messages'?{recipientId:b.recipientId,text:b.text}:b.item;if(!item||typeof item!=='object'||Array.isArray(item))return send(res,400,{error:'Datos inválidos'});if(mod==='messages'&&(!UUID.test(item.recipientId||'')||!String(item.text||'').trim()))return send(res,400,{error:'Destinatario y texto requeridos'});const r=await pool.query('INSERT INTO cryapp_module_records(id,owner_id,module,payload) VALUES($1,$2,$3,$4) RETURNING id',[randomUUID(),uid,mod,JSON.stringify(item)]);return send(res,201,{ok:true,id:r.rows[0].id})}
  if(id&&!UUID.test(id))return send(res,400,{error:'Identificador inválido'});
  if(req.method==='DELETE'&&id){const r=await pool.query('DELETE FROM cryapp_module_records WHERE id=$1 AND owner_id=$2 AND module=$3',[id,uid,mod]);return send(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'Registro no encontrado'})}
  if(req.method==='PATCH'&&id&&mod==='market'){const b=await body(req);if(!['ACTIVE','RESERVED','SOLD'].includes(b.status))return send(res,400,{error:'Estado inválido'});const r=await pool.query("UPDATE cryapp_module_records SET payload=jsonb_set(payload,'{status}',to_jsonb($1::text)) WHERE id=$2 AND owner_id=$3 AND module='market'",[b.status,id,uid]);return send(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'Publicación no encontrada'})}
  return send(res,405,{error:'Método no permitido'});
 }catch(e){console.error('Modules:',e.message);return send(res,500,{error:'No se pudo completar la operación. Revisa los permisos y las tablas de PostgreSQL.'})}};
};
