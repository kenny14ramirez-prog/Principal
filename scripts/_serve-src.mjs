import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png' };
const port = Number(process.argv[2] || 8123);
const server = createServer((req,res)=>{
  let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
  const file=join(root,p.replace(/^\//,''));
  try{statSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end('not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('SERVING '+port));
process.on('SIGINT',()=>{server.close();process.exit(0);});