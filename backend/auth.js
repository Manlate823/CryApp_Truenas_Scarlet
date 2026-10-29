const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function createAuth(pool) {
  return async function auth(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    const reply=(code,payload)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify(payload));};

    if (req.method === 'POST' && path === '/api/auth/register') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16384) {
            res.writeHead(413);
            return res.end(JSON.stringify({error:'Solicitud demasiado grande'}));
          }
        }

        const data = JSON.parse(body);
        const nombre = String(data.nombre || '').trim();
        const correo = String(data.correo || '').trim().toLowerCase();
        const password = data.password;

        if (nombre.length < 2 || nombre.length > 150 ||
            correo.length > 255 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
            typeof password !== 'string' ||
            password.length < 12 || password.length > 72) {
          res.writeHead(400);
          return res.end(JSON.stringify({error:'Datos invalidos'}));
        }

        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
          `INSERT INTO usuarios (nombre,correo,password_hash)
           VALUES ($1,$2,$3)
           RETURNING id,nombre,correo,rol`,
          [nombre, correo, hash]
        );

        res.writeHead(201);
        return res.end(JSON.stringify({
          status:'ok',
          usuario:result.rows[0]
        }));
      } catch (e) {
        res.writeHead(e.code === '23505' ? 409 : 400);
        return res.end(JSON.stringify({
          error:e.code === '23505'
            ? 'Correo ya registrado'
            : 'No se pudo registrar'
        }));
      }
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16384) {
            res.writeHead(413);
            return res.end(JSON.stringify({error:'Solicitud demasiado grande'}));
          }
        }

        const data = JSON.parse(body);
        const correo = String(data.correo || '').trim().toLowerCase();

        if (correo.length > 255 ||
            typeof data.password !== 'string') {
          res.writeHead(400);
          return res.end(JSON.stringify({error:'Datos invalidos'}));
        }

        const result = await pool.query(
          `SELECT id,nombre,correo,rol,activo,password_hash
           FROM usuarios WHERE correo=$1`,
          [correo]
        );

        const user = result.rows[0];

        if (!user || !user.activo ||
            !(await bcrypt.compare(data.password,user.password_hash))) {
          res.writeHead(401);
          return res.end(JSON.stringify({error:'Credenciales incorrectas'}));
        }

        const token = jwt.sign(
          {sub:user.id},
          process.env.JWT_SECRET,
          {expiresIn:'2h',algorithm:'HS256'}
        );

        res.writeHead(200);
        return res.end(JSON.stringify({
          status:'ok',
          token,
          usuario:{
            id:user.id,
            nombre:user.nombre,
            correo:user.correo,
            rol:user.rol
          }
        }));
      } catch (e) {
        console.error('Error de login:',e.message);
        res.writeHead(500);
        return res.end(JSON.stringify({error:'Error del servidor'}));
      }
    }

    if (req.method === 'GET' && path === '/api/auth/me') {
      try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ')
          ? header.slice(7) : '';

        const decoded = jwt.verify(token,process.env.JWT_SECRET,{
          algorithms:['HS256']
        });

        const result = await pool.query(
          `SELECT id,nombre,correo,rol,foto,criadero,telefono
           FROM usuarios WHERE id=$1 AND activo=TRUE`,
          [decoded.sub]
        );

        if (!result.rows.length) throw new Error('Usuario no activo');

        res.writeHead(200);
        return res.end(JSON.stringify({usuario:result.rows[0]}));
      } catch {
        res.writeHead(401);
        return res.end(JSON.stringify({error:'Sesion invalida'}));
      }
    }

    // Actualizar el perfil del usuario autenticado.
    if (req.method === 'PATCH' && path === '/api/auth/profile') {
      const reply = (code, payload) => {
        res.writeHead(code);
        return res.end(JSON.stringify(payload));
      };
      let decoded;
      try {
        const header = req.headers.authorization || '';
        if (!header.startsWith('Bearer ')) return reply(401, {error:'Sesion invalida'});
        decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, {
          algorithms:['HS256']
        });
      } catch {
        return reply(401, {error:'Sesion invalida'});
      }

      try {
        let body = '';
        const maxBody = 3 * 1024 * 1024;
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body, 'utf8') > maxBody) {
            return reply(413, {error:'La solicitud supera el limite de 3 MB'});
          }
        }
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return reply(400, {error:'Datos invalidos'});
        }
        const perfil = data.profile && typeof data.profile === 'object'
          ? data.profile : data;
        const nombre = perfil.name ?? perfil.nombre;
        const criadero = perfil.farmName ?? perfil.criadero;
        const telefono = perfil.phone ?? perfil.telefono;
        const foto = perfil.photo ?? perfil.foto;

        if (nombre !== undefined &&
            (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.trim().length > 150)) {
          return reply(400, {error:'El nombre debe tener entre 2 y 150 caracteres'});
        }
        if (criadero !== undefined &&
            (typeof criadero !== 'string' || criadero.trim().length > 150)) {
          return reply(400, {error:'Nombre del criadero invalido'});
        }
        if (telefono !== undefined &&
            (typeof telefono !== 'string' || telefono.trim().length > 30)) {
          return reply(400, {error:'Telefono invalido'});
        }
        if (foto !== undefined && foto !== null && foto !== '') {
          if (typeof foto !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(foto)) {
            return reply(400, {error:'Foto invalida: use PNG, JPG o WEBP'});
          }
          const encoded = foto.slice(foto.indexOf(',') + 1);
          if (Buffer.from(encoded, 'base64').length > 2 * 1024 * 1024) {
            return reply(413, {error:'La foto no debe superar 2 MB'});
          }
        }
        const result = await pool.query(
          `UPDATE usuarios SET
             nombre = COALESCE($2, nombre),
             criadero = COALESCE($3, criadero),
             telefono = COALESCE($4, telefono),
             foto = COALESCE($5, foto)
           WHERE id=$1 AND activo=TRUE
           RETURNING id,nombre,correo,rol,foto,criadero,telefono`,
          [decoded.sub,
           nombre === undefined ? null : nombre.trim(),
           criadero === undefined ? null : criadero.trim(),
           telefono === undefined ? null : telefono.trim(),
           foto || null]
        );
        if (!result.rows.length) return reply(401, {error:'Sesion invalida'});
        const user = result.rows[0];
        return reply(200, {status:'ok', usuario:user, user:{
          id:user.id, name:user.nombre, email:user.correo, role:user.rol,
          farmName:user.criadero, phone:user.telefono, photoUrl:user.foto
        }});
      } catch (e) {
        console.error('Error al guardar perfil:', e.message);
        return reply(400, {error:'No se pudo guardar el perfil'});
      }
    }


    if (req.method === 'GET' && path === '/api/auth/backup') {
      try {
        const h=req.headers.authorization||'';
        if(!h.startsWith('Bearer '))return reply(401,{error:'Sesion invalida'});
        const d=jwt.verify(h.slice(7),process.env.JWT_SECRET,{algorithms:['HS256']});
        const u=await pool.query('SELECT id,nombre,correo,rol,foto,criadero,telefono,activo FROM usuarios WHERE id=$1 AND activo=TRUE',[d.sub]);
        if(!u.rowCount)return reply(401,{error:'Sesion invalida'});
        const [birds,subs,payments,exists]=await Promise.all([
          pool.query('SELECT * FROM ejemplares WHERE usuario_id=$1 ORDER BY fecha_registro',[d.sub]),
          pool.query('SELECT plan_id,starts_at,ends_at,payment_id FROM cryapp_user_subscriptions WHERE user_id=$1',[d.sub]),
          pool.query('SELECT id,plan_id,amount_dop,currency,amount_usd,reference,status,created_at,reviewed_at,note FROM cryapp_payment_requests WHERE user_id=$1 ORDER BY created_at',[d.sub]),
          pool.query("SELECT to_regclass('public.cryapp_module_records') AS name")
        ]);
        let modules=[];
        if(exists.rows[0].name)modules=(await pool.query("SELECT id,owner_id,module,payload,created_at FROM cryapp_module_records WHERE owner_id=$1 OR (module='messages' AND payload->>'recipientId'=$1::text) ORDER BY created_at",[d.sub])).rows;
        const fs=require('node:fs/promises'),path=require('node:path'),root=process.env.CRYAPP_UPLOAD_DIR||'/data/cryapp-uploads';
        const embedPhoto=async value=>{
          if(typeof value!=='string')return value;
          const m=/^\/api\/fotos\/([0-9a-f-]{36}\.(jpg|png|webp))$/i.exec(value);
          if(!m)return value;
          try{return 'data:image/'+(m[2]==='jpg'?'jpeg':m[2])+';base64,'+(await fs.readFile(path.join(root,m[1]))).toString('base64')}catch{return value}
        };
        const embedTree=async value=>{
          if(typeof value==='string')return embedPhoto(value);
          if(Array.isArray(value))return Promise.all(value.map(embedTree));
          if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embedTree(v)])));
          return value;
        };
        const birdData=await Promise.all(birds.rows.map(async x=>({...x,foto:await embedPhoto(x.foto)})));
        const moduleData=await Promise.all(modules.map(async x=>({...x,payload:await embedTree(x.payload)})));
        return reply(200,{schemaVersion:1,exportedAt:new Date().toISOString(),account:u.rows[0],ejemplares:birdData,modulos:moduleData,suscripciones:subs.rows,solicitudesPago:payments.rows,nota:'Las fotos de ejemplares y módulos se incluyen en base64 cuando el archivo está disponible.'});
      } catch(e) {
        console.error('Error al exportar copia CryApp:',e.code||'UNKNOWN');
        return reply(500,{error:'No se pudo crear la copia de seguridad'});
      }
    }

    if (req.method === 'POST' && path === '/api/auth/delete-account') {
      const send=(code,payload)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
      let d,data;
      try {
        const h=req.headers.authorization||'';
        if(!h.startsWith('Bearer '))return send(401,{error:'Sesion invalida'});
        d=jwt.verify(h.slice(7),process.env.JWT_SECRET,{algorithms:['HS256']});
        let body='';
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,'utf8')>8192)return send(413,{error:'Solicitud demasiado grande'});}
        data=JSON.parse(body||'{}');
      } catch { return send(401,{error:'Sesion invalida o confirmacion invalida'}); }
      if(!data||data.confirmation!=='ELIMINAR'||typeof data.password!=='string'||!data.password.length||data.password.length>200)
        return send(400,{error:'Escribe ELIMINAR y confirma tu contraseña actual'});

      const c=await pool.connect();let photos=[];
      try {
        await c.query('BEGIN');
        const account=await c.query('SELECT id,password_hash FROM usuarios WHERE id=$1 AND activo=TRUE FOR UPDATE',[d.sub]);
        if(!account.rowCount||!(await bcrypt.compare(data.password,account.rows[0].password_hash))){await c.query('ROLLBACK');return send(403,{error:'Contraseña incorrecta o cuenta inactiva'});}
        const owner=await c.query('SELECT 1 FROM cryapp_admin_owner WHERE user_id=$1',[d.sub]);
        if(owner.rowCount){await c.query('ROLLBACK');return send(409,{error:'La cuenta propietaria de CryApp Admin no se puede borrar desde la app'});}
        const admin=await c.query('SELECT 1 FROM cryapp_admin_roles WHERE user_id=$1',[d.sub]);
        if(admin.rowCount){await c.query('ROLLBACK');return send(409,{error:'Quita primero los permisos administrativos de esta cuenta'});}
        const tables=await c.query("SELECT to_regclass('public.cryapp_module_records') AS modules,to_regclass('public.cryapp_presence') AS presence");
        const media=await c.query('SELECT foto AS url FROM ejemplares WHERE usuario_id=$1 AND foto IS NOT NULL',[d.sub]);
        if(tables.rows[0].modules)media.rows.push(...(await c.query('SELECT payload::text AS url FROM cryapp_module_records WHERE owner_id=$1',[d.sub])).rows);
        const names=new Set();
        for(const row of media.rows)for(const match of String(row.url||'').matchAll(/([0-9a-f]{8}-[0-9a-f-]{27}\.(?:jpg|png|webp))/ig))names.add(match[1]);
        photos=[...names].filter(x=>/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(x));
        if(tables.rows[0].presence)await c.query('DELETE FROM cryapp_presence WHERE user_id=$1',[d.sub]);
        if(tables.rows[0].modules)await c.query("DELETE FROM cryapp_module_records WHERE owner_id=$1 OR (module='messages' AND payload->>'recipientId'=$1::text)",[d.sub]);
        await c.query('DELETE FROM cryapp_password_reset_codes WHERE user_id=$1',[d.sub]);
        await c.query('DELETE FROM cryapp_admin_email_codes WHERE user_id=$1',[d.sub]);
        await c.query('UPDATE cryapp_user_subscriptions SET payment_id=NULL WHERE payment_id IN (SELECT id FROM cryapp_payment_requests WHERE user_id=$1)',[d.sub]);
        await c.query('UPDATE cryapp_payment_requests SET reviewed_by=NULL WHERE reviewed_by=$1',[d.sub]);
        await c.query('DELETE FROM cryapp_user_subscriptions WHERE user_id=$1',[d.sub]);
        await c.query('DELETE FROM cryapp_payment_requests WHERE user_id=$1',[d.sub]);
        await c.query("UPDATE cryapp_admin_audit SET actor_id=NULL,target=CASE WHEN target=$1 THEN 'deleted-account' ELSE target END,details=CASE WHEN target=$1 THEN '{}'::jsonb ELSE details END WHERE actor_id=$1 OR target=$1",[d.sub]);
        await c.query('UPDATE ejemplares SET padre_id=NULL,madre_id=NULL WHERE usuario_id=$1',[d.sub]);
        await c.query('DELETE FROM ejemplares WHERE usuario_id=$1',[d.sub]);
        await c.query('DELETE FROM usuarios WHERE id=$1',[d.sub]);
        await c.query('COMMIT');
      } catch(e) {
        await c.query('ROLLBACK').catch(()=>{});
        console.error('Error al eliminar cuenta CryApp:',e.code||'UNKNOWN');
        return send(500,{error:'No se pudo completar la eliminación de la cuenta'});
      } finally { c.release(); }

      const fs=require('node:fs/promises'),path=require('node:path'),root=process.env.CRYAPP_UPLOAD_DIR||'/data/cryapp-uploads';
      for(const name of photos)try{
        const ref=await pool.query("SELECT 1 FROM ejemplares WHERE foto=$1 UNION ALL SELECT 1 FROM cryapp_module_records WHERE payload::text LIKE $2 LIMIT 1",['/api/fotos/'+name,'%'+name+'%']);
        if(!ref.rowCount)await fs.unlink(path.join(root,name)).catch(()=>{});
      }catch{}
      return send(200,{ok:true,deleted:true});
    }

    return false;
  };
}

module.exports = createAuth;
