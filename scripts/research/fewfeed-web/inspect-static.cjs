// Offline parsing only; downloaded bundles are never imported or executed.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const traverse = require('@babel/traverse').default;
const dir = __dirname;
const terms = ['adimages','adcreatives','effective_object_story_id','object_story_spec','link_data','graph.facebook.com','graphql','scheduled_publish_time','story_ids','page_id','picture','caption','multi_share_end_card','multi_share_optimized','CREATE ONE-CARD POST','fb-one-card-picture-carousel'];
const coverage = {};
for (const name of fs.readdirSync(dir).filter(n => /\.js\.[a-f0-9]+\.txt$/.test(n))) {
  const source = fs.readFileSync(path.join(dir, name), 'utf8');
  coverage[name] = Object.fromEntries(terms.map(term => [term, source.split(term).length-1]));
  if (/^(worker-entry-|index-)/.test(name)) {
    const tree = parser.parse(source, {sourceType:'unambiguous'});
    const output = name.startsWith('worker-entry-') ? 'worker-entry.pretty.txt' : 'index.pretty.txt';
    fs.writeFileSync(path.join(dir, output), generate(tree).code + '\n');
    if(name.startsWith('worker-entry-')) {
      const handler = tree.program.body.find(n=>n.type==='FunctionDeclaration' && n.id.name==='km');
      fs.writeFileSync(path.join(dir,'one-card-component.txt'),'// EXTRACTED PUBLIC SOURCE FOR STATIC REVIEW ONLY\n'+generate(handler).code+'\n');
    }
  }
}
const disasm = path.join(dir,'vm-disassembly.txt');
if(fs.existsSync(disasm)) {
  const text=fs.readFileSync(disasm,'utf8');
  coverage['vm-disassembly.txt']=Object.fromEntries(terms.map(term=>[term,text.split(term).length-1]));
  const instructions=JSON.parse(fs.readFileSync(path.join(dir,'vm-instructions.json'),'utf8'));
  const ranges=[['export aliases',16060,16175],['uploadAdImage',76724,79040],['OneCard entry, builder, polling, finalization',81784,86092],['publish helper',59495,61766],['schedule helper',70469,72070],['activation wrapper',110542,110912]];
  fs.writeFileSync(path.join(dir,'one-card-evidence.txt'),ranges.map(([label,start,end])=>'\n=== '+label+'; PC ['+start+','+end+') ===\n'+instructions.filter(i=>i.pc>=start&&i.pc<end).map(i=>i.pc+': '+i.text).join('\n')).join('\n')+'\n');
}
fs.writeFileSync(path.join(dir,'search-coverage.json'),JSON.stringify(coverage,null,2)+'\n');
for (const name of fs.readdirSync(dir).filter(n => /^app-.*\.txt$/.test(n) && !n.includes('pretty'))) {
  const source = fs.readFileSync(path.join(dir, name), 'utf8');
  const ast = parser.parse(source);
  fs.writeFileSync(path.join(dir, 'app.pretty.txt'), '// STATIC ANALYSIS ONLY: DO NOT EXECUTE\n' + generate(ast).code + '\n');
  const strings = [];
  traverse(ast, { StringLiteral(p) { strings.push({ start: p.node.start, length: p.node.value.length, value: p.node.value.length < 500 ? p.node.value : '<large literal>' }); } });
  fs.writeFileSync(path.join(dir, 'literal-inventory.json'), JSON.stringify(strings, null, 2) + '\n');
  const body = ast.program.body.find(n => n.type === 'ExpressionStatement').expression.callee.body.body;
  for (const n of body) {
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) console.log(d.id.name, d.start, d.end, d.init?.type, generate(d.init).code.slice(0, 180));
    else console.log(n.type, n.id?.name, n.start, n.end);
  }
}
