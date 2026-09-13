// Offline extraction; inline scripts are saved as text and never executed.
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'page.html'),'utf8');
let i=0;
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if(!m[2]) continue;
  const name='inline-'+(++i)+'.txt';
  fs.writeFileSync(path.join(__dirname,name),m[2]+'\n');
  console.log(name,m[1],m[2].slice(0,150));
}
const urls=[...new Set([...html.matchAll(/(?:https?:\/\/[^\s"'<>\\]+|\/[A-Za-z0-9_./-]+\.js)/g)].map(m=>m[0]))];
console.log(JSON.stringify(urls,null,2));
