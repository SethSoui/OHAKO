import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const allowed = new Set(['index.html','styles.css','app.mjs','model.mjs','list-view.mjs','storage.mjs','sw.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable.png','icons/apple-touch-icon.png','tools/benchmark.html','tools/benchmark.mjs','tools/fixtures.mjs']);
const mime = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',js:'text/javascript; charset=utf-8',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png'};
const port = Number(process.argv[2] || process.env.PORT || 4173);
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/' || url.pathname === '/OHAKO') { res.writeHead(302,{Location:'/OHAKO/'}); res.end(); return; }
    if (!url.pathname.startsWith('/OHAKO/')) { res.writeHead(404); res.end('Not found'); return; }
    const path = decodeURIComponent(url.pathname.slice('/OHAKO/'.length)) || 'index.html';
    if (!allowed.has(path)) { res.writeHead(404); res.end('Not found'); return; }
    const contents = await readFile(root + path);
    res.writeHead(200,{'Content-Type':mime[path.split('.').pop()] ?? 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(contents);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'127.0.0.1',() => console.log(`OHAKO preview: http://127.0.0.1:${port}/OHAKO/`));
