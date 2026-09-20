// Windows-local static server for manual testing. Keeps the established :5173 origin
// so the user's IndexedDB remains available; never binds to the LAN.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../frontend/dist');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Missing frontend/dist. Run the build first.');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/__health'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('ok');return}
  let target=path.resolve(root,'.'+pathname);
  if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end('Forbidden');return}
  if(!path.extname(pathname))target=path.join(root,'index.html');
  fs.readFile(target,(error,data)=>{
    res.writeHead(error?404:200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','Cache-Control':'no-cache'});
    res.end(error?'Not found':data);
  });
});
server.on('error',error=>{console.error(error.message);process.exitCode=1});
server.listen(5173,'127.0.0.1');
