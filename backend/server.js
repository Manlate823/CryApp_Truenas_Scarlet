const createModules = require('./modules');
const createEjemplares = require('./ejemplares');
const createAuth = require('./auth');
const createSubscriptions = require('./subscriptions');
const http = require('node:http');
const fs = require('node:fs');
const pathModule = require('node:path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

const auth = createAuth(pool);
const ejemplares = createEjemplares(pool);
const modules = createModules(pool);
const subscriptions = createSubscriptions(pool);

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/subscriptions/')) return subscriptions.handler(req,res);
  // Restricción real en el servidor: el plan GRATIS no accede a datos de módulos.
  // Los administradores deben usar la API administrativa separada.
  if (path.startsWith('/api/modules/') || path === '/api/ejemplares' || path.startsWith('/api/ejemplares/')) {
    try {
      const uid=await subscriptions.identify(req);
      const sub=await subscriptions.membership(uid);
      if (!sub) {res.writeHead(403);return res.end(JSON.stringify({error:'Necesitas una suscripción PRO o PREMIUM activa',code:'PLAN_REQUIRED',requiredPlan:'pro'}));}
      if (path.startsWith('/api/modules/stats') && sub.plan_id!=='premium') {res.writeHead(403);return res.end(JSON.stringify({error:'Disponible solo en PREMIUM',code:'PLAN_REQUIRED',requiredPlan:'premium'}));}
    } catch(e) {res.writeHead(401);return res.end(JSON.stringify({error:'Sesión inválida o cuenta desactivada'}));}
  }
  if (path.startsWith('/api/auth/')) {
    const handled = await auth(req, res);
    if (handled === false) {
      res.writeHead(404);
      res.end(JSON.stringify({error: 'Ruta no encontrada'}));
    }
    return;
  }



  // Fotos de ejemplares: nombres aleatorios, sin listar carpetas ni aceptar rutas arbitrarias.
  if (req.method === 'GET' && /^\/api\/fotos\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) {
    const root = process.env.CRYAPP_UPLOAD_DIR || '/data/cryapp-uploads';
    const file = pathModule.join(root, path.slice('/api/fotos/'.length));
    try {
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) throw new Error('No es archivo');
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, {'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control':'public, max-age=86400', 'X-Content-Type-Options':'nosniff'});
      return fs.createReadStream(file).pipe(res);
    } catch {res.writeHead(404); return res.end(JSON.stringify({error:'Foto no encontrada'}));}
  }

  if (path.startsWith('/api/modules/')) return await modules(req,res);

  if (path === '/api/ejemplares' || path.startsWith('/api/ejemplares/')) {
    return await ejemplares(req, res);
  }

  if (req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: 'ok',
      app: 'CryApp API',
      version: '2.8.1'
    }));
  }

  if (req.url === '/health/storage') {
    const root = process.env.CRYAPP_UPLOAD_DIR || '/data/cryapp-uploads';
    try {
      await fs.promises.access(root, fs.constants.R_OK | fs.constants.W_OK);
      res.writeHead(200);
      return res.end(JSON.stringify({status:'ok',storage:'writable'}));
    } catch (error) {
      res.writeHead(503);
      return res.end(JSON.stringify({status:'error',storage:'unavailable',code:error.code || 'UNKNOWN'}));
    }
  }

  if (req.url === '/health/db') {
    try {
      await pool.query('SELECT 1');
      res.writeHead(200);
      return res.end(JSON.stringify({
        status: 'ok',
        database: 'connected'
      }));
    } catch (error) {
      console.error('Error de base de datos:', error.message);
      res.writeHead(503);
      return res.end(JSON.stringify({
        status: 'error',
        database: 'unavailable'
      }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

async function startServer() {
  try {
    await pool.query(`ALTER TABLE ejemplares
      ADD COLUMN IF NOT EXISTS color_placa TEXT,
      ADD COLUMN IF NOT EXISTS criadero TEXT,
      ADD COLUMN IF NOT EXISTS tipo_cresta TEXT,
      ADD COLUMN IF NOT EXISTS color_patas TEXT`);
    server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
      console.log('CryApp API iniciada');
    });
  } catch (error) {
    console.error('No se pudo preparar el esquema de ejemplares:', error.message);
    process.exitCode = 1;
    server.close();
    await pool.end().catch(() => {});
  }
}
startServer();
