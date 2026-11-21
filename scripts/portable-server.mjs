import {loginPath,publicRoutes} from '../lib/return-path.mjs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import {dirname,extname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sqliteAdapter} from './sqlite-adapter.mjs';
import {handleApi,getStudent} from '../lib/api.mjs';
import {seedDatabase} from '../lib/seed.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const MIME={'.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'};
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const inside=(root,path)=>{const rest=relative(root,path);return rest===''||(!rest.startsWith('..')&&!isAbsolute(rest));};

export function applyPortableMigrations(db,migrationsDir=resolve(projectRoot,'drizzle')) {
  db.sqlite.exec('CREATE TABLE IF NOT EXISTS _portable_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  for(const name of readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort()) {
    const sql=readFileSync(resolve(migrationsDir,name),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    const applied=db.sqlite.prepare('SELECT checksum FROM _portable_migrations WHERE name=?').get(name);
    if(applied) {
      if(applied.checksum!==checksum)throw new Error(`An applied migration changed: ${name}. Add a new migration instead.`);
      continue;
    }
    db.sqlite.exec('BEGIN IMMEDIATE');
    try {
      db.sqlite.exec(sql);
      db.sqlite.prepare('INSERT INTO _portable_migrations (name,checksum,applied_at) VALUES (?,?,?)').run(name,checksum,new Date().toISOString());
      db.sqlite.exec('COMMIT');
    } catch(error) {db.sqlite.exec('ROLLBACK');throw error;}
  }
}

function canonicalOrigin(value) {
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN must be an http(s) origin without credentials, path, query or fragment.');
  return url.origin;
}
function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  response.setHeader('X-Frame-Options','DENY');
  response.setHeader('Content-Security-Policy',CSP);
}
function errorResponse(response,status,message) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify({error:message}));
}
async function readBody(request) {
  const limit=16384,chunks=[];let size=0;
  if(Number(request.headers['content-length']||0)>limit)throw Object.assign(new Error('Слишком большой запрос.'),{status:413});
  for await(const chunk of request) {
    size+=chunk.length;
    if(size>limit)throw Object.assign(new Error('Слишком большой запрос.'),{status:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function forward(response,webResponse,head=false) {
  for(const [name,value] of webResponse.headers)response.setHeader(name,value);
  response.writeHead(webResponse.status);
  response.end(head?undefined:Buffer.from(await webResponse.arrayBuffer()));
}

export async function startPortableServer(options={}) {
  const host=options.host??process.env.HOST??'127.0.0.1';
  const port=Number(options.port??process.env.PORT??3000);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535.');
  const configuredOrigin=options.publicOrigin??process.env.PUBLIC_ORIGIN;
  let origin=configuredOrigin?canonicalOrigin(configuredOrigin):`http://127.0.0.1:${port}`;
  const clientDir=realpathSync(resolve(options.clientDir??resolve(projectRoot,'dist-portable/client')));
  const shell=readFileSync(resolve(clientDir,'index.html'));
  const dbPath=resolve(options.dbPath??process.env.DB_PATH??resolve(projectRoot,'data/orbita.sqlite'));
  mkdirSync(dirname(dbPath),{recursive:true});
  const db=sqliteAdapter(dbPath);
  try {applyPortableMigrations(db);await seedDatabase(db);}catch(error){db.sqlite.close();throw error;}
  const server=createServer(async(request,response)=>{
    securityHeaders(response);
    try {
      // Neither Host nor forwarding headers may choose the security origin.
      const target=request.url||'/';
      if(!target.startsWith('/')||target.startsWith('//')||target.includes('\\'))return errorResponse(response,400,'Некорректный адрес.');
      const url=new URL(target,origin);
      let pathname;
      try {pathname=decodeURIComponent(url.pathname);}catch{return errorResponse(response,400,'Некорректный адрес.');}
      if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(part=>part.startsWith('.')))return errorResponse(response,404,'Файл не найден.');
      const route=pathname.replace(/\/+$/,'')||'/';
      if(route==='/api'||route.startsWith('/api/')) {
        const headers=new Headers();
        for(const [name,value] of Object.entries(request.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
        // Portable deployments have no trusted Cloudflare edge. Never accept a
        // visitor-supplied CF or X-Forwarded-For value as a rate-limit identity.
        headers.set('cf-connecting-ip',request.socket.remoteAddress||'portable-local');
        const method=request.method||'GET';
        const body=['GET','HEAD'].includes(method)?undefined:await readBody(request);
        const webRequest=new Request(new URL(url.pathname+url.search,origin),{method,headers,...(body===undefined?{}:{body})});
        // Режимы входа и ведомости переносимая сборка берёт из окружения процесса.
        return await forward(response,await handleApi(webRequest,db,new Date(),process.env),method==='HEAD');
      }
      if(!['GET','HEAD'].includes(request.method||'')) {
        response.setHeader('Allow','GET, HEAD');
        return errorResponse(response,405,'Метод не поддерживается.');
      }
      const html=publicRoutes.includes(route)||route==='/index.html'||!extname(route);
      if(html) {
        if(!publicRoutes.includes(route)&&!await getStudent(db,request.headers.cookie||'')) {
          response.writeHead(303,{Location:loginPath(route+url.search),'Cache-Control':'no-store'});return response.end();
        }
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'});
        return response.end(request.method==='HEAD'?undefined:shell);
      }
      const type=MIME[extname(pathname).toLowerCase()];
      if(!type)return errorResponse(response,404,'Файл не найден.');
      const candidate=resolve(clientDir,'.'+pathname);
      if(!inside(clientDir,candidate))return errorResponse(response,404,'Файл не найден.');
      let file;
      try {file=realpathSync(candidate);if(!inside(clientDir,file)||!statSync(file).isFile())return errorResponse(response,404,'Файл не найден.');}
      catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return errorResponse(response,404,'Файл не найден.');throw error;}
      response.writeHead(200,{'Content-Type':type,'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate'});
      response.end(request.method==='HEAD'?undefined:readFileSync(file));
    } catch(error) {
      if(!response.headersSent)errorResponse(response,error.status||500,error.status?error.message:'Не удалось выполнить действие. Повторите попытку.');
      else response.destroy();
      if(!error.status)console.error('orbit_portable_failed',error?.name||'Error');
    }
  });
  server.requestTimeout=30000;
  server.headersTimeout=15000;
  try {await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,accept);});}
  catch(error){db.sqlite.close();throw error;}
  const address=server.address();
  if(!configuredOrigin)origin=`http://127.0.0.1:${address.port}`;
  let closing;
  return {server,db,origin,dbPath,address,
    close(){
      if(!closing)closing=new Promise((accept,reject)=>{server.close(error=>{try{db.sqlite.close();}catch(closeError){reject(closeError);return;}error?reject(error):accept();});server.closeIdleConnections();});
      return closing;
    }};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const runtime=await startPortableServer();
  console.log(`Orbita portable runtime: ${runtime.origin} (bind ${runtime.address.address}:${runtime.address.port})`);
  console.log(`Persistent SQLite: ${runtime.dbPath}`);
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;try{await runtime.close();}catch{process.exitCode=1;}};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
