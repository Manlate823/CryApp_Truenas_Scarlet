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
  await pool.query(`CREATE TABLE IF NOT EXISTS cryapp_breeding_crosses (id uuid PRIMARY KEY, owner_id uuid NOT NULL, numero_cruce text NOT NULL, padre_id uuid NOT NULL, madre_id uuid NOT NULL, fecha_cruce date NOT NULL, huevos integer NOT NULL DEFAULT 0 CHECK (huevos >= 0), fertiles integer NOT NULL DEFAULT 0 CHECK (fertiles >= 0), nacidos integer NOT NULL DEFAULT 0 CHECK (nacidos >= 0), fecha_registro timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id, numero_cruce))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS cryapp_breeding_crosses_owner_date ON cryapp_breeding_crosses(owner_id, fecha_cruce DESC)`);
  await pool.query(`ALTER TABLE ejemplares ADD COLUMN IF NOT EXISTS numero_cruce text`);
 })().catch(e=>{initialized=null;throw e});
 const send=(r,c,o)=>{r.writeHead(c,{'Content-Type':'application/json; charset=utf-8'});r.end(JSON.stringify(o))};
 const body=async req=>{let a=[],n=0;for await(const b of req){n+=b.length;if(n>200000)throw Error('Solicitud demasiado grande');a.push(b)}return JSON.parse(Buffer.concat(a).toString()||'{}')};
 return async(req,res)=>{try{
  const m=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'');if(!m||!process.env.JWT_SECRET)return send(res,401,{error:'Sesión requerida'});
  let user;try{user=jwt.verify(m[1],process.env.JWT_SECRET,{algorithms:['HS256']})}catch{return send(res,401,{error:'Sesión inválida'})}
  const uid=user.sub;if(!UUID.test(uid))return send(res,401,{error:'Usuario inválido'});
  await init();const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);const mod=parts[2],id=parts[3];
  if(mod==='crosses'&&req.method==='GET'){
   const r=await pool.query(`SELECT c.id,c.numero_cruce,c.padre_id,c.madre_id,c.fecha_cruce,c.huevos,c.fertiles,c.nacidos,c.fecha_registro,p.nombre AS padre_nombre,p.codigo AS padre_codigo,m.nombre AS madre_nombre,m.codigo AS madre_codigo FROM cryapp_breeding_crosses c JOIN ejemplares p ON p.id=c.padre_id AND p.usuario_id=c.owner_id JOIN ejemplares m ON m.id=c.madre_id AND m.usuario_id=c.owner_id WHERE c.owner_id=$1 ORDER BY c.fecha_cruce DESC,c.fecha_registro DESC`,[uid]);
   return send(res,200,{ok:true,items:r.rows.map(x=>({crossId:x.id,crossNumber:x.numero_cruce,fatherId:x.padre_id,motherId:x.madre_id,fatherName:x.padre_nombre||x.padre_codigo||'Gallo',motherName:x.madre_nombre||x.madre_codigo||'Gallina',crossDate:x.fecha_cruce,eggs:x.huevos,fertile:x.fertiles,born:x.nacidos,createdAt:x.fecha_registro}))});
  }
  if(mod==='crosses'&&req.method==='POST'){
   const b=await body(req),item=b.item||{};const fatherId=String(item.fatherId||''),motherId=String(item.motherId||''),crossDate=String(item.crossDate||'');
   if(!UUID.test(fatherId)||!UUID.test(motherId)||fatherId===motherId)return send(res,400,{error:'Selecciona un gallo y una gallina distintos'});
   if(!/^\d{4}-\d{2}-\d{2}$/.test(crossDate)||Number.isNaN(Date.parse(crossDate+'T00:00:00Z'))||new Date(crossDate+'T00:00:00Z').toISOString().slice(0,10)!==crossDate)return send(res,400,{error:'Fecha de cruce inválida'});
   const numeric=(v,label)=>{const n=v===''||v===undefined||v===null?0:Number(v);if(!Number.isInteger(n)||n<0)return {error:`${label} debe ser un número entero igual o mayor que cero`};return {value:n}};
   const eggs=numeric(item.eggs,'Huevos'),fertile=numeric(item.fertile,'Fértiles'),born=numeric(item.born,'Nacidos');if(eggs.error)return send(res,400,{error:eggs.error});if(fertile.error)return send(res,400,{error:fertile.error});if(born.error)return send(res,400,{error:born.error});
   if(fertile.value>eggs.value||born.value>fertile.value)return send(res,400,{error:'Los fértiles no pueden superar los huevos y los nacidos no pueden superar los fértiles'});
   const parents=await pool.query(`SELECT id,lower(sexo) AS sexo FROM ejemplares WHERE usuario_id=$1 AND id=ANY($2::uuid[])`,[uid,[fatherId,motherId]]);
   const byId=new Map(parents.rows.map(x=>[String(x.id),x.sexo]));if(byId.get(fatherId)!=='macho'||byId.get(motherId)!=='hembra')return send(res,400,{error:'Los ejemplares seleccionados deben ser un gallo y una gallina disponibles de tu criadero'});
   const client=await pool.connect();let crossNumber;
   try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[uid]);const seq=await client.query("SELECT COALESCE(MAX(NULLIF(substring(numero_cruce from 4), '')::integer),0)+1 AS siguiente FROM cryapp_breeding_crosses WHERE owner_id=$1",[uid]);crossNumber='CR-'+String(seq.rows[0].siguiente).padStart(5,'0');const saved=await client.query(`INSERT INTO cryapp_breeding_crosses(id,owner_id,numero_cruce,padre_id,madre_id,fecha_cruce,huevos,fertiles,nacidos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,numero_cruce`,[randomUUID(),uid,crossNumber,fatherId,motherId,crossDate,eggs.value,fertile.value,born.value]);await client.query('COMMIT');crossNumber=saved.rows[0].numero_cruce;return send(res,201,{ok:true,crossId:saved.rows[0].id,crossNumber});}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  }
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
  if(req.method==='GET'&&!id){
   if(mod==='market'){
    const r=await pool.query("SELECT r.id,r.owner_id,r.payload,r.created_at,e.foto AS bird_photo_url FROM cryapp_module_records r LEFT JOIN ejemplares e ON e.id::text=r.payload->>'birdId' AND e.usuario_id=r.owner_id WHERE r.module=$1 ORDER BY r.created_at DESC LIMIT 500",['market']);
    return send(res,200,{ok:true,items:r.rows.map(x=>Object.assign({},x.payload,{listingId:x.id,userId:x.owner_id,createdAt:x.created_at,birdPhotoUrl:x.bird_photo_url||''}))});
   }
   const r=await pool.query('SELECT id,owner_id,payload,created_at FROM cryapp_module_records WHERE module=$1 AND ($1=$2 OR owner_id=$3) ORDER BY created_at DESC LIMIT 500',[mod,'market',uid]);return send(res,200,{ok:true,items:r.rows.map(x=>({...x.payload,[mod==='events'?'eventId':mod==='market'?'listingId':'messageId']:x.id,userId:x.owner_id,createdAt:x.created_at}))})
  }
  if(req.method==='POST'&&!id){const b=await body(req);const item=mod==='messages'?{recipientId:b.recipientId,text:b.text}:b.item;if(!item||typeof item!=='object'||Array.isArray(item))return send(res,400,{error:'Datos inválidos'});if(mod==='messages'&&(!UUID.test(item.recipientId||'')||!String(item.text||'').trim()))return send(res,400,{error:'Destinatario y texto requeridos'});const r=await pool.query('INSERT INTO cryapp_module_records(id,owner_id,module,payload) VALUES($1,$2,$3,$4) RETURNING id',[randomUUID(),uid,mod,JSON.stringify(item)]);return send(res,201,{ok:true,id:r.rows[0].id})}
  if(id&&!UUID.test(id))return send(res,400,{error:'Identificador inválido'});
  if(req.method==='DELETE'&&id){const r=await pool.query('DELETE FROM cryapp_module_records WHERE id=$1 AND owner_id=$2 AND module=$3',[id,uid,mod]);return send(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'Registro no encontrado'})}
  if(req.method==='PATCH'&&id&&mod==='market'){
   const b=await body(req);
   if(Object.prototype.hasOwnProperty.call(b,'status')){
    if(!['ACTIVE','RESERVED','SOLD'].includes(b.status))return send(res,400,{error:'Estado inválido'});
    const r=await pool.query("UPDATE cryapp_module_records SET payload=jsonb_set(payload,'{status}',to_jsonb($1::text)) WHERE id=$2 AND owner_id=$3 AND module='market'",[b.status,id,uid]);return send(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'Publicación no encontrada'});
   }
   const item=b.item,types=['VENTA','REPRODUCCION','HUEVOS','ALIMENTOS','ACCESORIOS','EQUIPOS'];
   if(!item||typeof item!=='object'||Array.isArray(item))return send(res,400,{error:'Datos inválidos'});
   if(Object.keys(item).some(k=>!['title','type','price','location','description','birdId','currency'].includes(k)))return send(res,400,{error:'Campo no permitido'});
   if(typeof item.title!=='string'||!item.title.trim()||item.title.length>150)return send(res,400,{error:'Título inválido'});
   if(!types.includes(item.type))return send(res,400,{error:'Categoría inválida'});
   if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>5000))return send(res,400,{error:'Descripción inválida'});
   if(item.location!==undefined&&(typeof item.location!=='string'||item.location.length>200))return send(res,400,{error:'Ubicación inválida'});
   const price=item.price===''||item.price===null||item.price===undefined?null:Number(item.price);
   if(price!==null&&(!Number.isFinite(price)||price<0))return send(res,400,{error:'Precio inválido'});
   const birdId=item.birdId||'';
   if(birdId&&!UUID.test(birdId))return send(res,400,{error:'Ejemplar inválido'});
   const saved={...item,title:item.title.trim(),price,birdId,currency:'USD'};
   const r=await pool.query("UPDATE cryapp_module_records SET payload=payload||$1::jsonb WHERE id=$2 AND owner_id=$3 AND module='market' RETURNING id",[JSON.stringify(saved),id,uid]);
   return send(res,r.rowCount?200:404,r.rowCount?{ok:true,id:r.rows[0].id}:{error:'Publicación no encontrada'});
  }
  return send(res,405,{error:'Método no permitido'});
 }catch(e){console.error('Modules:',e.message);return send(res,500,{error:'No se pudo completar la operación. Revisa los permisos y las tablas de PostgreSQL.'})}};
};
