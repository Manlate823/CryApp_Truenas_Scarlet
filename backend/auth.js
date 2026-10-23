const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function createAuth(pool) {
  return async function auth(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;

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


    // Exportación privada de los datos propios. Nunca incluye hash de contraseña.
    if (req.method === 'GET' && path === '/api/auth/backup') {
      try {
        const header=req.headers.authorization||'';
        const decoded=jwt.verify(header.replace(/^Bearer\\s+/i,''),process.env.JWT_SECRET,{algorithms:['HS256']});
        const user=await pool.query('SELECT id,nombre,correo,rol,foto,criadero,telefono FROM usuarios WHERE id=$1 AND activo=TRUE',[decoded.sub]);
        if(!user.rowCount){res.writeHead(401);return res.end(JSON.stringify({error:'Cuenta no activa'}));}
        const birds=await pool.query('SELECT * FROM ejemplares WHERE usuario_id=$1',[decoded.sub]);
        let modules=[];
        try {const r=await pool.query('SELECT id,module,payload,created_at FROM cryapp_module_records WHERE owner_id=$1',[decoded.sub]);modules=r.rows;}catch(e){if(e.code!=='42P01')throw e;}
        const subs=await pool.query('SELECT plan_id,starts_at,ends_at FROM cryapp_user_subscriptions WHERE user_id=$1',[decoded.sub]);
        const payments=await pool.query('SELECT plan_id,amount_dop,reference,status,created_at FROM cryapp_payment_requests WHERE user_id=$1',[decoded.sub]);
        const data={format:'cryapp-account-export-v1',exportedAt:new Date().toISOString(),profile:user.rows[0],birds:birds.rows,modules,subscriptions:subs.rows,payments:payments.rows,note:'Las fotos se referencian por su URL; este JSON no incluye los archivos binarios.'};
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="cryapp-copia-seguridad.json"','Cache-Control':'no-store'});
        return res.end(JSON.stringify(data,null,2));
      } catch(e){console.error('Backup:',e.message);res.writeHead(500);return res.end(JSON.stringify({error:'No se pudo generar la copia de seguridad'}));}
    }

    // Eliminación solicitada por el titular, con contraseña y confirmación.
    // Transacción atómica: cualquier restricción de integridad revierte TODOS los cambios.
    if (req.method === 'POST' && path === '/api/auth/delete-account') {
      let client;
      try {
        const header=req.headers.authorization||'';
        const decoded=jwt.verify(header.replace(/^Bearer\\s+/i,''),process.env.JWT_SECRET,{algorithms:['HS256']});
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Solicitud demasiado grande');}
        const data=JSON.parse(raw||'{}');
        if(data.confirm!=='ELIMINAR MI CUENTA'||typeof data.password!=='string'){res.writeHead(400);return res.end(JSON.stringify({error:'Confirmación incorrecta'}));}
        client=await pool.connect();await client.query('BEGIN');
        const u=await client.query('SELECT id,password_hash FROM usuarios WHERE id=$1 AND activo=TRUE FOR UPDATE',[decoded.sub]);
        if(!u.rowCount||!(await bcrypt.compare(data.password,u.rows[0].password_hash))){await client.query('ROLLBACK');res.writeHead(403);return res.end(JSON.stringify({error:'Contraseña incorrecta'}));}
        await client.query('DELETE FROM cryapp_payment_requests WHERE user_id=$1',[decoded.sub]);
        await client.query('DELETE FROM cryapp_user_subscriptions WHERE user_id=$1',[decoded.sub]);
        await client.query('DELETE FROM ejemplares WHERE usuario_id=$1',[decoded.sub]);
        await client.query('DELETE FROM cryapp_module_records WHERE owner_id=$1',[decoded.sub]).catch(e=>{if(e.code!=='42P01')throw e});
        await client.query('DELETE FROM usuarios WHERE id=$1',[decoded.sub]);
        await client.query('COMMIT');
        res.writeHead(200,{'Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true}));
      } catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Delete account:',e.code||e.message);res.writeHead(409);return res.end(JSON.stringify({error:'No se pudo eliminar la cuenta de forma segura. No se realizó ninguna eliminación. Contacta con soporte.'}));}
      finally{if(client)client.release();}
    }

    return false;
  };
}

module.exports = createAuth;
