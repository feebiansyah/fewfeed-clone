// Offline consistency checks only. No browser/network, no execution of downloaded code.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const parser=require('@babel/parser');
const assert=require('node:assert/strict');
const resources=JSON.parse(fs.readFileSync(path.join(__dirname,'resources.json'),'utf8'));
let parsed=0;
for(const r of resources) {
  assert.equal(new URL(r.url).origin,'https://fewfeed.net');
  if(!r.file) continue;
  const data=fs.readFileSync(path.join(__dirname,r.file));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),r.sha256Sanitized,r.file);
  if(r.file.includes('.js.')) {parser.parse(data.toString('utf8'),{sourceType:'unambiguous'});parsed++;}
}
const instructions=JSON.parse(fs.readFileSync(path.join(__dirname,'vm-instructions.json'),'utf8'));
const at=new Map(instructions.map(i=>[i.pc,i]));
assert.equal(at.get(16166).text,'r7["qjn"] = r8');
assert.equal(at.get(16159).text,'r10 = scope[1842]');
assert.equal(at.get(11039).text,'r5 = function@81784(arity=1, name="")');
assert.equal(at.get(84941).text,'r8 = 15');
assert.equal(at.get(85939).text,'r10 = 4000');
assert.equal(at.get(84175).text,'r10 = 0');
assert.equal(at.get(84178).text,'r9 = !r10');
assert.equal(at.get(84181).text,'r8["multi_share_end_card"] = r9');
assert.equal(at.get(61150).args[0],'"5001941423228398"');
assert.equal(at.get(71491).args[0],'"5001941423228398"');
const between=instructions.filter(i=>i.pc>=84762&&i.pc<85486);
assert.equal(between.filter(i=>i.text.includes('window["fetch"]')).length,1);
assert(!between.some(i=>/adsets|adcreatives|\/ads\b|graphql/.test(i.text)));
const allText=instructions.map(i=>i.text).join('\n');
assert(!/PROXY_FETCH|PROXY_UPLOAD|to_extension|postMessage|sendMessage/.test(allText));
let suspectedSecretLiterals=0;
for(const i of instructions)for(const arg of i.args)if(arg.startsWith('"')) {
  const value=JSON.parse(arg);
  if(/^EAA[A-Za-z0-9]{30,}$/.test(value)||/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value)||/\bc_user=\d{5,}/.test(value))suspectedSecretLiterals++;
}
assert.equal(suspectedSecretLiterals,0,'Potential session/credential literals require redaction');
const reference={
  'content.js':'cf3424ec402fe863566ffefffe1faed8792c366819217535a7e41b73e8adf016',
  'bg.js':'a21172337e781cdafb2c10c181b9cb41cd53c1b201f13a3e42181bce6e8b154b',
  'inject.js':'5123acdf7953487d6c9b8b52012178a04629fb4bf7bf1d07a3e35a0ee6c0c8b1',
  'manifest.json':'7fcab23b2256eae183a0d60915fd9edf3772411636836cf2cfba792fcdb41e2e'
};
for(const [name,hash]of Object.entries(reference))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../../reference/FewFeedV3.9.3',name))).digest('hex'),hash);
const result={status:'PASS',publicResources:resources.filter(r=>r.file).length,parsedBundles:parsed,sourceMap404:resources.filter(r=>r.url.endsWith('.map')&&r.status===404).length,instructions:instructions.length,pollLimit:15,delayMs:4000,explicitBridgeCallsFound:false,suspectedSecretLiterals,unchangedReferenceFiles:4,note:'Static consistency checks only; no Meta/browser execution; server-side behavior untested.'};
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
