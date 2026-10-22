'use strict';
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs'),nodemailer=require('nodemailer'),{Pool}=require('pg');
const pool=new Pool({host:process.env.DB_HOST,port:+(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,max:5});
const SECRET=process.env.ADMIN_JWT_SECRET;
const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:Number(process.env.SMTP_PORT||587),secure:false,requireTLS:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},tls:{minVersion:'TLSv1.2'}});
const validEmail=e=>typeof e==='string'&&e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const otpDigest=(id,email,code)=>crypto.createHmac('sha256',SECRET).update(id+':'+email+':'+code).digest('hex');

if(!SECRET||SECRET.length<32)throw Error('ADMIN_JWT_SECRET debe tener al menos 32 caracteres');
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const read=async(req)=>{let s='';for await(const c of req){s+=c;if(s.length>16000)throw Error('Solicitud demasiado grande')}return JSON.parse(s||'{}')};
const auth=async(req)=>{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw Error('No autorizado');const d=jwt.verify(h.slice(7),SECRET,{algorithms:['HS256'],issuer:'cryapp-admin',audience:'cryapp-admin'});const r=await pool.query('SELECT o.user_id AS id,o.email,u.nombre FROM cryapp_admin_owner o JOIN usuarios u ON u.id=o.user_id WHERE o.user_id=$1',[d.sub]);if(!r.rowCount||d.email!==r.rows[0].email)throw Error('Sesión revocada');return {...r.rows[0],role:'superadmin'}};
const allow=(user,roles)=>{if(!roles.includes(user.role))throw Error('Permiso denegado')};
const audit=async(c,id,action,target,details={})=>c.query('INSERT INTO cryapp_admin_audit(actor_id,action,target,details) VALUES($1,$2,$3,$4)',[id,action,target,JSON.stringify(details)]);
const serve=(res)=>{const data=fs.readFileSync(path.join(__dirname,'public','index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'});res.end(data)};
const server=http.createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;try{
 if(req.method==='GET'&&p==='/health')return json(res,200,{status:'ok'});
 if(req.method==='GET'&&p==='/')return serve(res);
 if(req.method==='GET'&&p==='/app.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,'public','app.js')))}
 if(req.method==='POST'&&p==='/api/login'){
  const b=await read(req),email=String(b.email||'').trim().toLowerCase();if(email.length>255||typeof b.password!=='string'||b.password.length>200)return json(res,400,{error:'Datos inválidos'});
  const q=await pool.query('SELECT o.user_id AS id,o.password_hash,u.nombre FROM cryapp_admin_owner o JOIN usuarios u ON u.id=o.user_id WHERE o.email=$1',[email]);
  if(!q.rowCount||!(await bcrypt.compare(b.password,q.rows[0].password_hash)))return json(res,401,{error:'Credenciales incorrectas'});
  const u=q.rows[0],token=jwt.sign({sub:u.id,email},SECRET,{expiresIn:'30m',algorithm:'HS256',issuer:'cryapp-admin',audience:'cryapp-admin'});return json(res,200,{token,user:{name:u.nombre,role:'superadmin'}});
 }
 if(!p.startsWith('/api/'))return json(res,404,{error:'No encontrado'});
 let u;try{u=await auth(req)}catch{return json(res,401,{error:'Sesión inválida o sin permisos'})}
 if(req.method==='GET'&&p==='/api/me')return json(res,200,{user:u});
 if(req.method==='GET'&&p==='/api/overview'){
  const [users,pending,active,income]=await Promise.all([pool.query('SELECT count(*)::int n FROM usuarios'),pool.query("SELECT count(*)::int n FROM cryapp_payment_requests WHERE status='pending'"),pool.query('SELECT count(*)::int n FROM cryapp_user_subscriptions WHERE ends_at>now()'),pool.query("SELECT COALESCE(sum(amount_dop),0)::numeric n FROM cryapp_payment_requests WHERE status='approved' AND reviewed_at>=date_trunc('month',now())")]);return json(res,200,{users:users.rows[0].n,pending:pending.rows[0].n,active:active.rows[0].n,income:income.rows[0].n});
 }
 if(req.method==='GET'&&p==='/api/subscriptions'){
  const r=await pool.query("SELECT s.user_id,u.nombre,u.correo,s.plan_id,s.starts_at,s.ends_at,s.payment_id,(s.ends_at>now()) AS vigente FROM cryapp_user_subscriptions s JOIN usuarios u ON u.id=s.user_id ORDER BY s.ends_at DESC LIMIT 500");return json(res,200,{items:r.rows});
 }
 if(req.method==='POST'&&p==='/api/subscriptions/manage'){
  const b=await read(req);if(!/^[0-9a-f-]{36}$/i.test(b.userId||'')||!['assign','renew','cancel'].includes(b.action))return json(res,400,{error:'Solicitud inválida'});
  if(b.userId===u.id)return json(res,400,{error:'No se permite modificar la suscripción de la cuenta propietaria desde aquí'});
  const months=Number(b.months);if(b.action!=='cancel'&&(!['pro','premium'].includes(b.planId)||!Number.isInteger(months)||months<1||months>36))return json(res,400,{error:'Plan o duración inválidos (1 a 36 meses)'});
  const c=await pool.connect();try{await c.query('BEGIN');const person=await c.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE',[b.userId]);if(!person.rowCount){await c.query('ROLLBACK');return json(res,404,{error:'Usuario no encontrado'})}
  if(b.action==='cancel'){await c.query('DELETE FROM cryapp_user_subscriptions WHERE user_id=$1',[b.userId]);}
  else {const plan=await c.query('SELECT id FROM cryapp_subscription_plans WHERE id=$1 AND active=true',[b.planId]);if(!plan.rowCount){await c.query('ROLLBACK');return json(res,400,{error:'Plan inactivo'})}
   if(b.action==='renew'){const existing=await c.query('SELECT plan_id FROM cryapp_user_subscriptions WHERE user_id=$1',[b.userId]);if(!existing.rowCount){await c.query('ROLLBACK');return json(res,409,{error:'El cliente no tiene suscripción. Utiliza Activar.'})}if(existing.rows[0].plan_id!==b.planId){await c.query('ROLLBACK');return json(res,409,{error:'Para cambiar de plan utiliza Activar.'})}}
   await c.query(`INSERT INTO cryapp_user_subscriptions(user_id,plan_id,starts_at,ends_at,payment_id)
   VALUES($1,$2,now(),now()+($3::int*interval '1 month'),NULL)
   ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,
   starts_at=CASE WHEN $4='renew' THEN cryapp_user_subscriptions.starts_at ELSE now() END,
   ends_at=CASE WHEN $4='renew' THEN GREATEST(cryapp_user_subscriptions.ends_at,now())+($3::int*interval '1 month') ELSE EXCLUDED.ends_at END,
   payment_id=CASE WHEN $4='renew' THEN cryapp_user_subscriptions.payment_id ELSE NULL END`,[b.userId,b.planId,months,b.action]);}
  await audit(c,u.id,'subscription_'+b.action,b.userId,{plan:b.action==='cancel'?null:b.planId,months:b.action==='cancel'?null:months,manual:true});await c.query('COMMIT');return json(res,200,{ok:true});
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 if(req.method==='POST'&&p==='/api/profile/email/request'){
  const b=await read(req),email=String(b.newEmail||'').trim().toLowerCase();
  if(!validEmail(email)||typeof b.currentPassword!=='string'||b.currentPassword.length>200)return json(res,400,{error:'Correo o contraseña inválidos'});
  const owner=await pool.query('SELECT email,password_hash FROM cryapp_admin_owner WHERE user_id=$1',[u.id]);
  if(!owner.rowCount||!(await bcrypt.compare(b.currentPassword,owner.rows[0].password_hash)))return json(res,403,{error:'Contraseña administrativa incorrecta'});
  if(email===owner.rows[0].email)return json(res,400,{error:'El nuevo correo es igual al actual'});
  const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const previous=await c.query('SELECT sent_at FROM cryapp_admin_email_codes WHERE user_id=$1 FOR UPDATE',[u.id]);
   if(previous.rowCount&&Date.now()-new Date(previous.rows[0].sent_at).getTime()<60000){await c.query('ROLLBACK');return json(res,429,{error:'Espera un minuto antes de solicitar otro código'})}
   await c.query(`INSERT INTO cryapp_admin_email_codes(user_id,new_email,code_hash,expires_at,sent_at,attempts)
     VALUES($1,$2,$3,now()+interval '10 minutes',now(),0)
     ON CONFLICT(user_id) DO UPDATE SET new_email=EXCLUDED.new_email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=now(),attempts=0`,[u.id,email,otpDigest(u.id,email,code)]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  try{await mailer.sendMail({from:{name:'CryApp Seguridad',address:process.env.SMTP_USER},to:email,subject:'Código de verificación CryApp Admin PRO',text:`Tu código de verificación es ${code}. Vence en 10 minutos. Si no solicitaste este cambio, ignora el mensaje.`});}
  catch(e){await pool.query('DELETE FROM cryapp_admin_email_codes WHERE user_id=$1 AND code_hash=$2',[u.id,otpDigest(u.id,email,code)]);console.error('SMTP: no se pudo enviar código');return json(res,502,{error:'No se pudo enviar el correo. Revisa la configuración SMTP.'})}
  return json(res,200,{ok:true,message:'Código enviado al nuevo correo. Vence en 10 minutos.'});
 }
 if(req.method==='POST'&&p==='/api/profile/email/confirm'){
  const b=await read(req),email=String(b.newEmail||'').trim().toLowerCase(),code=String(b.code||'').trim();
  if(!validEmail(email)||!/^\d{6}$/.test(code)||typeof b.currentPassword!=='string'||b.currentPassword.length>200)return json(res,400,{error:'Datos inválidos'});
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const owner=await c.query('SELECT email,password_hash FROM cryapp_admin_owner WHERE user_id=$1 FOR UPDATE',[u.id]);
   if(!owner.rowCount||!(await bcrypt.compare(b.currentPassword,owner.rows[0].password_hash))){await c.query('ROLLBACK');return json(res,403,{error:'Contraseña administrativa incorrecta'})}
   const q=await c.query('SELECT * FROM cryapp_admin_email_codes WHERE user_id=$1 FOR UPDATE',[u.id]);
   if(!q.rowCount||q.rows[0].new_email!==email||new Date(q.rows[0].expires_at).getTime()<=Date.now()||q.rows[0].attempts>=5){await c.query('ROLLBACK');return json(res,400,{error:'Código vencido o inválido. Solicita uno nuevo.'})}
   const good=crypto.timingSafeEqual(Buffer.from(q.rows[0].code_hash,'hex'),Buffer.from(otpDigest(u.id,email,code),'hex'));
   if(!good){await c.query('UPDATE cryapp_admin_email_codes SET attempts=attempts+1 WHERE user_id=$1',[u.id]);await c.query('COMMIT');return json(res,400,{error:'Código incorrecto. Máximo 5 intentos.'})}
   await c.query('UPDATE cryapp_admin_owner SET email=$2 WHERE user_id=$1',[u.id,email]);
   await c.query('DELETE FROM cryapp_admin_email_codes WHERE user_id=$1',[u.id]);
   await audit(c,u.id,'owner_email_changed',u.id,{old_email:owner.rows[0].email,new_email:email});
   await c.query('COMMIT');return json(res,200,{ok:true,relogin:true});
  }catch(e){await c.query('ROLLBACK');if(e.code==='23505')return json(res,409,{error:'Este correo ya está en uso'});throw e}finally{c.release()}
 }
 if(req.method==='PATCH'&&p==='/api/profile'){
  const b=await read(req);if(typeof b.currentPassword!=='string'||b.currentPassword.length>200)return json(res,400,{error:'Contraseña actual requerida'});
  const owner=await pool.query('SELECT password_hash,email FROM cryapp_admin_owner WHERE user_id=$1',[u.id]);if(!owner.rowCount||!(await bcrypt.compare(b.currentPassword,owner.rows[0].password_hash)))return json(res,403,{error:'Contraseña actual incorrecta'});
  const email=String(b.email||'').trim().toLowerCase(),pass=b.newPassword;
  if(!email&&!pass)return json(res,400,{error:'No hay cambios'});
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))return json(res,400,{error:'Correo inválido'});
  if(pass&&(typeof pass!=='string'||pass.length<12||pass.length>200))return json(res,400,{error:'La nueva contraseña debe tener entre 12 y 200 caracteres'});
  if(email&&email!==owner.rows[0].email)return json(res,400,{error:'Para cambiar el correo se requiere verificación de la nueva dirección. No está habilitada aún; no se realizó ningún cambio.'});
  const hash=pass?await bcrypt.hash(pass,12):null;const c=await pool.connect();try{await c.query('BEGIN');if(hash)await c.query('UPDATE cryapp_admin_owner SET password_hash=$2 WHERE user_id=$1',[u.id,hash]);await audit(c,u.id,'owner_password_changed',u.id,{});await c.query('COMMIT');return json(res,200,{ok:true,relogin:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 if(req.method==='GET'&&p==='/api/plans'){const r=await pool.query('SELECT * FROM cryapp_subscription_plans ORDER BY price_dop');return json(res,200,{items:r.rows})}
 if(req.method==='GET'&&p==='/api/payments'){const r=await pool.query('SELECT p.id,p.user_id,u.nombre,p.plan_id,p.amount_dop,p.reference,p.status,p.created_at,p.reviewed_at,p.note FROM cryapp_payment_requests p JOIN usuarios u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200');return json(res,200,{items:r.rows})}
 if(req.method==='GET'&&p==='/api/users'){allow(u,['superadmin','admin']);const r=await pool.query('SELECT u.id,u.nombre,u.correo,u.activo,CASE WHEN o.user_id IS NULL THEN NULL ELSE \'superadmin\' END AS role FROM usuarios u LEFT JOIN cryapp_admin_owner o ON o.user_id=u.id ORDER BY u.nombre LIMIT 300');return json(res,200,{items:r.rows})}
 if(req.method==='POST'&&p==='/api/payments'){allow(u,['superadmin','admin','payments']);const b=await read(req);if(!/^[0-9a-f-]{36}$/i.test(b.userId||'')||!['pro','premium'].includes(b.planId)||String(b.reference||'').length>200)return json(res,400,{error:'Datos inválidos'});const plan=await pool.query('SELECT * FROM cryapp_subscription_plans WHERE id=$1 AND active=TRUE',[b.planId]);if(!plan.rowCount)return json(res,400,{error:'Plan no disponible'});const id=crypto.randomUUID();await pool.query('INSERT INTO cryapp_payment_requests(id,user_id,plan_id,amount_dop,reference) VALUES($1,$2,$3,$4,$5)',[id,b.userId,b.planId,plan.rows[0].price_dop,String(b.reference||'')]);return json(res,201,{id})}
 const match=p.match(/^\/api\/payments\/([0-9a-f-]{36})\/(approve|reject)$/i);
 if(req.method==='POST'&&match){allow(u,['superadmin','admin','payments']);const c=await pool.connect();try{await c.query('BEGIN');const q=await c.query("SELECT p.*,pl.duration_days FROM cryapp_payment_requests p JOIN cryapp_subscription_plans pl ON pl.id=p.plan_id WHERE p.id=$1 FOR UPDATE OF p",[match[1]]);if(!q.rowCount||q.rows[0].status!=='pending'){await c.query('ROLLBACK');return json(res,409,{error:'Solicitud ya procesada o inexistente'})}const item=q.rows[0],status=match[2]==='approve'?'approved':'rejected';await c.query('UPDATE cryapp_payment_requests SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1',[item.id,status,u.id]);if(status==='approved')await c.query("INSERT INTO cryapp_user_subscriptions(user_id,plan_id,starts_at,ends_at,payment_id) VALUES($1,$2,now(),now()+($3::int*interval '1 day'),$4) ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,payment_id=EXCLUDED.payment_id",[item.user_id,item.plan_id,item.duration_days,item.id]);await audit(c,u.id,'payment_'+status,item.id,{user_id:item.user_id,plan:item.plan_id});await c.query('COMMIT');return json(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 if(req.method==='GET'&&p==='/api/revenue'){const r=await pool.query("SELECT to_char(date_trunc('month',reviewed_at),'YYYY-MM') AS month,COALESCE(sum(amount_dop),0)::numeric AS total FROM cryapp_payment_requests WHERE status='approved' AND reviewed_at>=date_trunc('month',now())-interval '5 months' GROUP BY 1 ORDER BY 1");return json(res,200,{items:r.rows})}
 if(req.method==='GET'&&p==='/api/audit'){const r=await pool.query('SELECT a.action,a.target,a.created_at,u.nombre FROM cryapp_admin_audit a LEFT JOIN usuarios u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100');return json(res,200,{items:r.rows})}
 if(req.method==='PATCH'&&p==='/api/plans'){const b=await read(req);if(!['pro','premium'].includes(b.id)||typeof b.name!=='string'||b.name.trim().length<2||b.name.length>70||!Number.isFinite(Number(b.price_dop))||Number(b.price_dop)<0||!Number.isInteger(Number(b.duration_days))||Number(b.duration_days)<1||Number(b.duration_days)>3650||typeof b.active!=='boolean')return json(res,400,{error:'Datos inválidos'});const c=await pool.connect();try{await c.query('BEGIN');await c.query('UPDATE cryapp_subscription_plans SET name=$2,price_dop=$3,duration_days=$4,active=$5 WHERE id=$1',[b.id,b.name.trim(),Number(b.price_dop),Number(b.duration_days),b.active]);await audit(c,u.id,'plan_updated',b.id,{name:b.name.trim(),price_dop:Number(b.price_dop),duration_days:Number(b.duration_days),active:b.active});await c.query('COMMIT');return json(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 if(req.method==='PATCH'&&p==='/api/users'){const b=await read(req);if(!/^[0-9a-f-]{36}$/i.test(b.id||'')||typeof b.nombre!=='string'||!b.nombre.trim()||b.nombre.length>120||typeof b.activo!=='boolean')return json(res,400,{error:'Datos inválidos'});if(b.id===u.id&&b.activo===false)return json(res,400,{error:'No puedes desactivar tu propia cuenta'});const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query('UPDATE usuarios SET nombre=$2,activo=$3 WHERE id=$1 RETURNING id',[b.id,b.nombre.trim(),b.activo]);if(!r.rowCount){await c.query('ROLLBACK');return json(res,404,{error:'Usuario no encontrado'})}await audit(c,u.id,'user_updated',b.id,{nombre:b.nombre.trim(),activo:b.activo});await c.query('COMMIT');return json(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 return json(res,404,{error:'Ruta no encontrada'});
 }catch(e){console.error('Admin error:',e.message);return json(res,500,{error:'Error al procesar la solicitud'})}});
server.listen(3000,'0.0.0.0',()=>console.log('CryApp Admin listo en puerto 3000'));
