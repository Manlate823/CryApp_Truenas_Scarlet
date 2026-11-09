'use strict';

const jwt = require('jsonwebtoken');
const fs = require('node:fs/promises');
const pathModule = require('node:path');
const { randomUUID } = require('node:crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4_000_000; // Solo fotos; solicitudes normales limitadas abajo.
const TEXT_FIELDS = {
  nombre: 150,
  codigo: 100,
  sexo: 20,
  raza: 100,
  color: 100,
  color_placa: 100,
  criadero: 150,
  tipo_cresta: 100,
  color_patas: 100,
  foto: 10_000,
  estado: 30,
  observaciones: 10_000,
  numero_cruce: 20
};
const EDITABLE_FIELDS = new Set([
  ...Object.keys(TEXT_FIELDS),
  'fecha_nacimiento', 'padre_id', 'madre_id'
]);

function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJSON(req, limit = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('Datos demasiado grandes');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('JSON invalido');
    err.status = 400;
    throw err;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const err = new Error('Se esperaba un objeto JSON');
    err.status = 400;
    throw err;
  }
  return data;
}

function validDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateFields(data, creating) {
  if (creating && !Object.hasOwn(data, 'nombre')) return 'Nombre obligatorio';
  if (!Object.keys(data).length) return 'No hay campos para guardar';
  for (const [field, value] of Object.entries(data)) {
    if (!EDITABLE_FIELDS.has(field)) return `Campo no permitido: ${field}`;
    if (Object.hasOwn(TEXT_FIELDS, field)) {
      if (value !== null && (typeof value !== 'string' || value.length > TEXT_FIELDS[field])) {
        return `Campo invalido: ${field}`;
      }
      if (field === 'nombre' && (typeof value !== 'string' || !value.trim())) {
        return 'Nombre invalido';
      }
    } else if (field === 'fecha_nacimiento') {
      if (!validDate(value)) return 'Fecha de nacimiento invalida';
    } else if (value !== null && (typeof value !== 'string' || !UUID_RE.test(value))) {
      return `ID invalido: ${field}`;
    }
  }
  if (data.sexo !== undefined && data.sexo !== null && !['macho', 'hembra'].includes(data.sexo.toLowerCase())) {
    return 'Sexo debe ser macho o hembra';
  }
  return null;
}

async function validateParents(pool, usuarioId, padreId, madreId, ownId) {
  if (padreId && madreId && padreId === madreId) return 'Padre y madre deben ser diferentes';
  if (ownId && (padreId === ownId || madreId === ownId)) return 'Un ejemplar no puede ser su propio progenitor';
  for (const [id, expected, field] of [[padreId, 'macho', 'padre_id'], [madreId, 'hembra', 'madre_id']]) {
    if (!id) continue;
    const found = await pool.query('SELECT sexo FROM ejemplares WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
    if (!found.rows.length || (found.rows[0].sexo || '').toLowerCase() !== expected) {
      return `Familiar invalido: ${field}`;
    }
  }
  // Impide que un ejemplar sea ancestro de sí mismo mediante enlaces existentes.
  if (ownId && (padreId || madreId)) {
    const result = await pool.query(`
      WITH RECURSIVE ancestros(id, padre_id, madre_id) AS (
        SELECT id, padre_id, madre_id FROM ejemplares
        WHERE id = ANY($1::uuid[]) AND usuario_id = $2
        UNION
        SELECT e.id, e.padre_id, e.madre_id
        FROM ejemplares e
        JOIN ancestros a ON e.id = a.padre_id OR e.id = a.madre_id
        WHERE e.usuario_id = $2
      )
      SELECT 1 FROM ancestros WHERE id = $3 LIMIT 1
    `, [[padreId, madreId].filter(Boolean), usuarioId, ownId]);
    if (result.rows.length) return 'Relacion genealogica circular';
  }
  return null;
}


let breedingSchemaReady;
function ensureBreedingSchema(pool) {
  return breedingSchemaReady ||= (async () => {
    await pool.query('ALTER TABLE ejemplares ADD COLUMN IF NOT EXISTS numero_cruce text');
    await pool.query(`CREATE TABLE IF NOT EXISTS cryapp_breeding_crosses (id uuid PRIMARY KEY, owner_id uuid NOT NULL, numero_cruce text NOT NULL, padre_id uuid NOT NULL, madre_id uuid NOT NULL, fecha_cruce date NOT NULL, huevos integer NOT NULL DEFAULT 0 CHECK (huevos >= 0), fertiles integer NOT NULL DEFAULT 0 CHECK (fertiles >= 0), nacidos integer NOT NULL DEFAULT 0 CHECK (nacidos >= 0), fecha_registro timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id, numero_cruce))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cryapp_breeding_crosses_owner_date ON cryapp_breeding_crosses(owner_id, fecha_cruce DESC)`);
  })().catch(error => { breedingSchemaReady = null; throw error; });
}

async function resolveCrossNumber(pool, usuarioId, padreId, madreId, requested) {
  if (!padreId || !madreId) {
    return requested ? { error: 'El número de cruce necesita padre y madre asignados' } : { value: null };
  }
  const params = requested ? [usuarioId, padreId, madreId, requested] : [usuarioId, padreId, madreId];
  const result = await pool.query(`
    SELECT numero_cruce FROM cryapp_breeding_crosses
    WHERE owner_id=$1 AND padre_id=$2 AND madre_id=$3 ${requested ? 'AND numero_cruce=$4' : ''}
    ORDER BY fecha_cruce DESC, fecha_registro DESC LIMIT 1
  `, params);
  if (result.rows.length) return { value: result.rows[0].numero_cruce };
  return requested ? { error: 'Ese número no corresponde a los padres seleccionados' } : { value: null };
}

module.exports = function createEjemplares(pool) {
  return async function ejemplares(req, res) {
    const authorization = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    let usuario;
    try {
      if (!match || !process.env.JWT_SECRET) throw new Error('Token ausente');
      usuario = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return reply(res, 401, { error: 'Sesion invalida' });
    }
    const usuarioId = usuario.sub;
    if (typeof usuarioId !== 'string' || !UUID_RE.test(usuarioId)) {
      return reply(res, 401, { error: 'Usuario no identificado' });
    }

    const pathname = new URL(req.url, 'http://localhost').pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'ejemplares' || parts.length > 4) {
      return reply(res, 404, { error: 'Ruta no encontrada' });
    }
    const id = parts[2] || null;
    if (id && !UUID_RE.test(id)) return reply(res, 400, { error: 'ID de ejemplar invalido' });

    try {
      await ensureBreedingSchema(pool);
      // POST /api/ejemplares/:id/foto (JSON base64, JWT requerido).
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'foto') {
        if (!UUID_RE.test(parts[2])) return reply(res, 400, {error:'ID invalido'});
        const exists = await pool.query('SELECT id FROM ejemplares WHERE id=$1 AND usuario_id=$2',[parts[2],usuarioId]);
        if (!exists.rows.length) return reply(res,404,{error:'Ejemplar no encontrado'});
        const data = await readJSON(req, MAX_BODY_BYTES);
        const photo = data.photo;
        if (!photo || typeof photo !== 'object') return reply(res,400,{error:'Fotografia requerida'});
        const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.mimeType];
        if (!ext || typeof photo.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64)) return reply(res,400,{error:'Formato de foto invalido'});
        const bytes = Buffer.from(photo.base64,'base64');
        if (!bytes.length || bytes.length > 2_500_000) return reply(res,413,{error:'Foto demasiado grande (maximo 2.5 MB)'});
        const jpeg=ext==='jpg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
        const png=ext==='png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const webp=ext==='webp' && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
        if (!(jpeg||png||webp)) return reply(res,400,{error:'Contenido de imagen no valido'});
        const folder = process.env.CRYAPP_UPLOAD_DIR || '/data/cryapp-uploads';
        await fs.mkdir(folder,{recursive:true});
        const filename=randomUUID()+'.'+ext;
        const file=pathModule.join(folder,filename);
        await fs.writeFile(file,bytes,{flag:'wx',mode:0o644});
        const photoUrl='/api/fotos/'+filename;
        try {
          await pool.query('UPDATE ejemplares SET foto=$1 WHERE id=$2 AND usuario_id=$3',[photoUrl,parts[2],usuarioId]);
        } catch(err) {await fs.unlink(file).catch(()=>{});throw err;}
        return reply(res,200,{status:'ok',photoSaved:true,photoUrl});
      }
      if (req.method === 'GET') {
        if (id) {
          const found = await pool.query('SELECT * FROM ejemplares WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
          if (!found.rows.length) return reply(res, 404, { error: 'Ejemplar no encontrado' });
          return reply(res, 200, { status: 'ok', ejemplar: found.rows[0] });
        }
        const found = await pool.query('SELECT * FROM ejemplares WHERE usuario_id = $1 ORDER BY fecha_registro DESC', [usuarioId]);
        return reply(res, 200, { status: 'ok', ejemplares: found.rows });
      }

      if (req.method === 'POST' && !id) {
        const data = await readJSON(req);
        const invalid = validateFields(data, true);
        if (invalid) return reply(res, 400, { error: invalid });
        const parentError = await validateParents(pool, usuarioId, data.padre_id || null, data.madre_id || null, null);
        if (parentError) return reply(res, 400, { error: parentError });
        const cross = await resolveCrossNumber(pool, usuarioId, data.padre_id || null, data.madre_id || null, data.numero_cruce || null);
        if (cross.error) return reply(res, 400, { error: cross.error });
        data.numero_cruce = cross.value;
        const fields = ['codigo', 'nombre', 'sexo', 'raza', 'color', 'color_placa', 'criadero', 'tipo_cresta', 'color_patas', 'fecha_nacimiento', 'foto', 'padre_id', 'madre_id', 'numero_cruce', 'estado', 'observaciones'];
        const values = fields.map(field => {
          const value = data[field];
          if (field === 'estado') return value || 'activo';
          if (field === 'nombre') return value.trim();
          return value === undefined || value === '' ? null : value;
        });
        const placeholders = fields.map((_, index) => `$${index + 2}`).join(', ');
        const saved = await pool.query(
          `INSERT INTO ejemplares (usuario_id, ${fields.join(', ')}) VALUES ($1, ${placeholders}) RETURNING *`,
          [usuarioId, ...values]
        );
        return reply(res, 201, { status: 'ok', ejemplar: saved.rows[0] });
      }

      if (req.method === 'DELETE' && id) {
        const deleted=await pool.query('DELETE FROM ejemplares WHERE id=$1 AND usuario_id=$2 RETURNING id',[id,usuarioId]);
        return reply(res,deleted.rowCount?200:404,deleted.rowCount?{ok:true}:{error:'Ejemplar no encontrado'});
      }
      if (req.method === 'PATCH' && id) {
        const data = await readJSON(req);
        const invalid = validateFields(data, false);
        if (invalid) return reply(res, 400, { error: invalid });
        const current = await pool.query('SELECT * FROM ejemplares WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
        if (!current.rows.length) return reply(res, 404, { error: 'Ejemplar no encontrado' });
        const parentError = await validateParents(
          pool, usuarioId,
          Object.hasOwn(data, 'padre_id') ? data.padre_id : current.rows[0].padre_id,
          Object.hasOwn(data, 'madre_id') ? data.madre_id : current.rows[0].madre_id,
          id
        );
        if (parentError) return reply(res, 400, { error: parentError });
        const pairChanged = Object.hasOwn(data, 'padre_id') || Object.hasOwn(data, 'madre_id');
        if (pairChanged || Object.hasOwn(data, 'numero_cruce')) {
          const fatherId = Object.hasOwn(data, 'padre_id') ? data.padre_id : current.rows[0].padre_id;
          const motherId = Object.hasOwn(data, 'madre_id') ? data.madre_id : current.rows[0].madre_id;
          const requested = Object.hasOwn(data, 'numero_cruce') ? data.numero_cruce : null;
          const cross = await resolveCrossNumber(pool, usuarioId, fatherId, motherId, requested);
          if (cross.error) return reply(res, 400, { error: cross.error });
          data.numero_cruce = cross.value;
        }
        const fields = Object.keys(data);
        const values = fields.map(field => field === 'nombre' ? data[field].trim() : data[field]);
        const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const saved = await pool.query(
          `UPDATE ejemplares SET ${assignments} WHERE id = $${values.length + 1} AND usuario_id = $${values.length + 2} RETURNING *`,
          [...values, id, usuarioId]
        );
        if (!saved.rows.length) return reply(res, 404, { error: 'Ejemplar no encontrado' });
        return reply(res, 200, { status: 'ok', ejemplar: saved.rows[0] });
      }

      return reply(res, 405, { error: 'Metodo no permitido' });
    } catch (error) {
      if (error.status) return reply(res, error.status, { error: error.message });
      if (error.code === '22P02' || error.code === '22007' || error.code === '22008') {
        return reply(res, 400, { error: 'Formato de datos invalido' });
      }
      console.error('Error en ejemplares:', error.code || 'UNKNOWN', error.message);
      if (['EACCES','EPERM','EROFS'].includes(error.code)) return reply(res, 500, { error: 'No se puede escribir en el directorio de fotos. Revisar permisos del volumen de uploads.' });
      if (error.code === 'ENOENT') return reply(res, 500, { error: 'No existe la ruta de almacenamiento de fotografías.' });
      return reply(res, 500, { error: 'Error interno. Consultar los registros de la API.' });
    }
  };
};
