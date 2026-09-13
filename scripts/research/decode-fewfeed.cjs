// Offline static analysis only. Never eval/import/execute extension source.
// Uses installed Babel solely to parse, resolve bindings and print AST nodes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const root = path.resolve(__dirname, '../..');
function decode(value, key) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
  let out = '', bits = 0, count = 0;
  for (const ch of value) {
    const n = alphabet.indexOf(ch);
    if (n < 0) continue;
    bits = count % 4 ? bits * 64 + n : n;
    if (count++ % 4) out += String.fromCharCode(255 & (bits >> ((-2 * count) & 6)));
  }
  out = decodeURIComponent(Array.from(out, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0, result = '';
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0; j = 0;
  for (let k = 0; k < out.length; k++) {
    i = (i + 1) % 256; j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    result += String.fromCharCode(out.charCodeAt(k) ^ s[(s[i] + s[j]) % 256]);
  }
  return result;
}
for (const file of ['content', 'bg']) {
  const source = fs.readFileSync(path.join(root, 'reference/FewFeedV3.9.3', file + '.js'), 'utf8');
  const ast = parser.parse(source);
  const paths = new WeakMap();
  traverse(ast, { enter(p) { paths.set(p.node, p); } });
  const decoderName = file === 'content' ? '_0x1c58' : '_0x566c';
  const tableName = file === 'content' ? '_0x2ad6' : '_0x5868';
  const tableFn = ast.program.body.find(n => n.id?.name === tableName);
  const table = tableFn.body.body[0].declarations[0].init.elements.map(n => n.value);
  const decoderFn = ast.program.body.find(n => n.id?.name === decoderName);
  let rotation = 0;
  function val(n, env = new Map(), depth = 0) {
    if (!n || depth > 50) throw Error('unsupported/depth');
    const v = x => val(x, env, depth + 1);
    if (t.isNumericLiteral(n) || t.isStringLiteral(n) || t.isBooleanLiteral(n)) return n.value;
    if (t.isIdentifier(n) && env.has(n.name)) return env.get(n.name);
    if (t.isUnaryExpression(n)) {
      const a = v(n.argument);
      if (n.operator === '-') return -a;
      if (n.operator === '+') return +a;
      if (n.operator === '!') return !a;
      if (n.operator === '~') return ~a;
    }
    if (t.isArrayExpression(n) && n.elements.length === 0) return [];
    if (t.isBinaryExpression(n)) {
      const a = v(n.left), b = v(n.right);
      switch (n.operator) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return a / b; case '%': return a % b; case '===': return a === b;
        case '!==': return a !== b; case '==': return a == b; case '!=': return a != b;
      }
    }
    if (t.isCallExpression(n) && t.isIdentifier(n.callee)) {
      const args = n.arguments.map(v);
      if (n.callee.name === 'parseInt') return parseInt(args[0]);
      if (n.callee.name === decoderName) {
        const offset = val(decoderFn.body.body[0].expression.right.right);
        return decode(table[((args[0] - offset) + rotation) % table.length], args[1]);
      }
      const binding = paths.get(n)?.scope.getBinding(n.callee.name);
      const fn = binding?.path.node;
      // Only single-return wrapper functions; never interpret arbitrary statements.
      if (t.isFunctionDeclaration(fn) && fn.body.body.length === 1 && t.isReturnStatement(fn.body.body[0])) {
        const local = new Map(env);
        fn.params.forEach((p, i) => local.set(p.name, args[i]));
        return val(fn.body.body[0].argument, local, depth + 1);
      }
    }
    throw Error('unsupported ' + n.type);
  }
  const initial = ast.program.body[0].expression;
  const target = val(initial.arguments[1]);
  const loop = initial.callee.body.body.find(t.isWhileStatement);
  const checksum = loop.body.body[0].block.body[0].declarations[0].init;
  let found = false;
  for (; rotation < table.length; rotation++) {
    try { if (val(checksum) === target) { found = true; break; } } catch {}
  }
  if (!found) throw Error('No checksum rotation for ' + file);
  let replaced = 0;
  traverse(ast, { CallExpression(p) {
    if (!t.isIdentifier(p.node.callee) || !p.node.callee.name.startsWith('_0x')) return;
    try { const x = val(p.node); if (typeof x === 'string') { p.replaceWith(t.stringLiteral(x)); replaced++; } } catch {}
  } });
  for (let pass = 0; pass < 8; pass++) traverse(ast, {
    BinaryExpression: { exit(p) { try { const x = val(p.node); if (['string', 'number', 'boolean'].includes(typeof x) && (typeof x !== 'number' || Number.isFinite(x))) p.replaceWith(t.valueToNode(x)); } catch {} } },
    MemberExpression(p) { if (p.node.computed && t.isStringLiteral(p.node.property) && t.isValidIdentifier(p.node.property.value)) { p.node.computed = false; p.node.property = t.identifier(p.node.property.value); } }
  });
  // Keep decoded source as non-executable text. Remove decoder/table boilerplate only.
  ast.program.body = ast.program.body.filter((n, i) => i !== 0 && n.id?.name !== decoderName && n.id?.name !== tableName);
  const output = '// STATIC RESEARCH OUTPUT — DO NOT EXECUTE. Original offsets in report.\n' + generate(ast, { comments: false }).code + '\n';
  fs.writeFileSync(path.join(__dirname, file + '.decoded.txt'), output);
  console.log(JSON.stringify({ file, sha256: crypto.createHash('sha256').update(source).digest('hex'), tableSize: table.length, rotation, replaced }));
}
