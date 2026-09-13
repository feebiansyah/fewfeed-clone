// Offline bytecode DATA decoder/disassembler. Never runs the VM or any instruction.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const file = fs.readdirSync(__dirname).find(n => /^app-.*\.js\.[a-f0-9]+\.txt$/.test(n));
const ast = parser.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const body = ast.program.body.find(n => n.type === 'ExpressionStatement').expression.callee.body.body;
const vars = Object.fromEntries(body.filter(n => n.type === 'VariableDeclaration').flatMap(n => n.declarations.map(d => [d.id.name, d.init])));
const encoded = vars.e.value, alphabet = vars.k.arguments[1].value, base = vars.k.arguments[2].value;
const words = [];
for (let cursor = 0; cursor < encoded.length;) {
  let sum = 0, multiplier = 1;
  for (let count = 0;; count++) {
    if (count > 20 || cursor >= encoded.length) throw Error('Invalid encoded integer');
    const digit = alphabet.indexOf(encoded[cursor++]);
    if (digit < 0) throw Error('Invalid alphabet character');
    sum += multiplier * (digit % base);
    if (digit < base) { words.push(sum | 0); break; }
    sum += base * multiplier;
    multiplier *= alphabet.length - base;
  }
}
const originalLength = words.length;
// Source creates 28 a-z chars: indexOf('.') is always -1; ('' + true).length is 4.
const tableStart = words[words.length - 1] ^ (words.length + 4);
if (words[tableStart] !== 28) throw Error('String table marker mismatch');
const tableLength = words[tableStart + 1];
const tableWords = words.splice(tableStart, tableLength + 2);
const table = tableWords.slice(2).map(a => String.fromCharCode((a & 4294967232) | ((a * 39) & 63))).join('');
if (table.length !== tableLength) throw Error('String table length mismatch');
fs.writeFileSync(path.join(__dirname, 'vm-string-table.txt'), table);
fs.writeFileSync(path.join(__dirname, 'vm-words.json'), JSON.stringify(words));
fs.writeFileSync(path.join(__dirname, 'vm-opcodes.txt'), vars.F.elements.map((fn, i) => i + ': ' + generate(fn, { compact: true }).code).join('\n') + '\n');
console.log(JSON.stringify({ originalLength, tableStart, tableLength, remainingWords: words.length }));
const terms = ['adimages','adcreatives','effective_object_story_id','object_story_spec','link_data','graph.facebook.com','graphql','scheduled_publish_time','story_ids','page_id','picture','caption','multi_share_end_card','multi_share_optimized','CREATE ONE-CARD POST','fb-one-card-picture-carousel'];
for (const term of terms) {
  const at = table.indexOf(term);
  console.log(term, at, at >= 0 ? JSON.stringify(table.slice(Math.max(0, at - 50), at + term.length + 120)) : '');
}
// Operand counts/destination flags transcribed from vm-opcodes.txt, not executed.
const spec = [[1,1],[2,1],[1,1],[1,0],[1,1],[2,1],[0,0],[3,1],[2,1],[2,1],[0,1],[0,1],[2,1],[2,1],[0,0],[2,1],[0,0],[2,1],[1,0],[1,1],[2,1],[1,0],[2,0],[1,0],[2,1],[2,1],[2,1],[2,1],[3,0],[2,1],[2,1],[1,1],[2,0],[2,1],[1,1],[1,0],[2,1],[2,1],[2,1],[2,1],[0,1],[1,1],[2,0],[1,0],[4,1],[1,1],[1,1],[3,1],[2,1],[2,1],[2,0],[2,1],[2,1],[3,0],[2,1],[0,1],[2,1],[0,1],[0,1],[1,0],[0,1],[0,0]];
let pc = 1; // g() initializes the instruction pointer to 1; word 0 is not an opcode.
function operand() {
  const w = words[pc++];
  if (w & 1) return String(w >> 1);
  if (w === 36) return 'undefined';
  if (w === 8) return 'null';
  if (w === 16) return 'false';
  if (w === 10) return 'true';
  if (w === 28) {
    const at = words[pc++], length = words[pc++];
    if (at < 0 || at + length > table.length) throw Error('Invalid string reference at ' + pc);
    return JSON.stringify(table.slice(at, at + length));
  }
  if (w === 22) {
    const buf = Buffer.alloc(8); buf.writeInt32BE(words[pc++], 0); buf.writeInt32BE(words[pc++], 4);
    return String(buf.readDoubleBE());
  }
  return 'r' + (w >> 5);
}
const instructions = [];
const binary = {1:'&',5:'!=',8:'-',9:'^',12:'*',13:'>=',15:'%',17:'<=',20:'<',25:'>',26:'|',29:'instanceof',30:'>>',33:'!==',36:'===',37:'in',38:'<<',39:'+',48:'>>>',51:'==',52:'/'};
while (pc < words.length - 1) {
  const start = pc, op = words[pc++];
  if (!spec[op]) throw Error('Unknown opcode at ' + start + ': ' + op);
  const [count, writes] = spec[op], a = Array.from({length:count}, operand);
  const dest = writes ? 'r' + (words[pc++] >> 5) : null;
  let expr;
  if (binary[op]) expr = a[0] + ' ' + binary[op] + ' ' + a[1];
  else switch(op) {
    case 0: expr='keys('+a[0]+')'; break;
    case 2: expr=a[0]; break;
    case 3: expr='return '+a[0]; break;
    case 4: expr='!'+a[0]; break;
    case 6: expr='resume_exception_or_return'; break;
    case 7: case 24: case 44: case 46: expr=a[0]+'('+a.slice(1).join(', ')+')'; break;
    case 10: expr='regeneratorRuntime'; break;
    case 11: expr='{}'; break;
    case 14: expr='clear_exception'; break;
    case 16: expr='halt'; break;
    case 18: expr='goto '+a[0]; break;
    case 19: expr='typeof '+a[0]; break;
    case 21: expr='catch_target '+a[0]; break;
    case 22: expr='if '+a[1]+' goto '+a[0]; break;
    case 23: expr='local['+a[0]+'] = undefined'; break;
    case 27: expr=a[0]+'['+a[1]+']'; break;
    case 28: expr=a[0]+'['+a[1]+'] = '+a[2]; break;
    case 31: expr='~'+a[0]; break;
    case 32: expr='scope['+a[0]+'] = '+a[1]; break;
    case 34: expr='Array('+a[0]+')'; break;
    case 35: expr='local['+a[0]+'] = VM_X_l'; break;
    case 40: expr='undefined'; break;
    case 41: expr='window['+a[0]+']'; break;
    case 42: expr='if !'+a[1]+' goto '+a[0]; break;
    case 43: expr='throw '+a[0]; break;
    case 45: expr='scope['+a[0]+']'; break;
    case 47: expr='function@'+a[0]+'(arity='+a[1]+', name='+a[2]+')'; break;
    case 49: expr='delete '+a[0]+'['+a[1]+']'; break;
    case 50: expr='local['+a[0]+'] = '+a[1]; break;
    case 53: expr='r2 = APPLY '+a[1]+' THIS '+a[2]+' ARGS '+a[0]; break;
    case 54: expr='CONSTRUCT '+a[0]+' ARGS '+a[1]; break;
    case 55: expr='Promise'; break;
    case 56: expr='RegExp('+a.join(', ')+')'; break;
    case 57: expr='this'; break;
    case 58: expr='[]'; break;
    case 59: expr='finally_target '+a[0]; break;
    case 60: expr='exception'; break;
    case 61: expr='return undefined'; break;
    default: throw Error('Missing disassembly rendering '+op);
  }
  instructions.push({pc:start,end:pc,op,args:a,dest,text:(dest?dest+' = ':'')+expr});
}
const boundaries = new Set(instructions.map(i=>i.pc));
let targets = 0;
for(const i of instructions) if([18,21,22,42,47,59].includes(i.op)&&/^\d+$/.test(i.args[0])) {
  if(Number(i.args[0]) && !boundaries.has(Number(i.args[0]))) throw Error('Non-boundary target '+i.args[0]);
  targets++;
}
fs.writeFileSync(path.join(__dirname,'vm-disassembly.txt'), '// STATIC PSEUDOCODE; NEVER EXECUTE. pc values index decoded words.\n'+instructions.map(i=>i.pc.toString().padStart(6,'0')+': '+i.text).join('\n')+'\n');
fs.writeFileSync(path.join(__dirname,'vm-instructions.json'),JSON.stringify(instructions)+'\n');
console.log(JSON.stringify({instructions:instructions.length,validatedTargets:targets,decodedThrough:pc,trailer:words[pc]}));
