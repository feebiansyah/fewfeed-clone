// Public GET acquisition only. No browser, cookies, credentials or execution of downloaded code.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const origin = 'https://fewfeed.net';
const target = '/tool/fb-one-card-picture-carousel';
const manifestPath = path.join(__dirname, 'resources.json');
const records = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
function allowed(value) {
  const u = new URL(value, origin);
  if (u.origin !== origin || u.username || u.password || u.search || u.hash ||
      !(u.pathname === target || /^\/(?:_next\/static\/|assets\/)?[\w./%\-]+\.(?:js|map)$/.test(u.pathname))) {
    throw Error('URL outside public resource scope');
  }
  return u;
}
function redact(s) {
  return s.replace(/(["']token["']\s*:\s*["'])[A-Za-z0-9_.-]{12,}(["'])/gi, '$1[REDACTED_PUBLIC_OR_SECRET_TOKEN]$2')
    .replace(/\bEAA[A-Za-z0-9]{30,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/((?:access_token|fb_dtsg|jazoest|c_user|sessionToken|session_token)\s*[=:]\s*["']?)([A-Za-z0-9_%.-]{12,})/gi,
      (all, prefix, value) => /^[A-Za-z_$][\w$]*$/.test(value) && value.length < 25 ? all : prefix + '[REDACTED_VALUE]');
}
async function get(value, redirects = 0) {
  const u = allowed(value);
  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers: { 'User-Agent': 'Static-Source-Research/1.0', Accept: 'text/html,application/javascript,application/json,text/plain' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3) return reject(Error('Redirect limit'));
        try { resolve(get(allowed(new URL(res.headers.location, u).href).href, redirects + 1)); } catch (e) { reject(e); }
        return;
      }
      const chunks = []; let size = 0;
      res.on('data', b => { size += b.length; if (size > 25 * 1024 * 1024) req.destroy(Error('Resource too large')); else chunks.push(b); });
      res.on('end', () => resolve({ url: u.href, status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    req.setTimeout(30000, () => req.destroy(Error('GET timeout')));
    req.on('error', reject);
  });
}
async function save(url) {
  const r = await get(url);
  const clean = redact(r.text);
  const digest = crypto.createHash('sha256').update(clean).digest('hex');
  const name = new URL(r.url).pathname === target ? 'page.html' : path.basename(new URL(r.url).pathname) + '.' + digest.slice(0, 10) + '.txt';
  const ok = r.status === 200;
  const record = { url: r.url, status: r.status, contentType: r.contentType, retrievedAt: new Date().toISOString(), file: ok ? name : null, sha256Sanitized: ok ? digest : null, bytesSanitized: ok ? Buffer.byteLength(clean) : 0, redacted: clean !== r.text };
  if (ok) fs.writeFileSync(path.join(__dirname, name), clean);
  const prior = records.findIndex(x => x.url === r.url);
  if (prior >= 0) records[prior] = record; else records.push(record);
  fs.writeFileSync(manifestPath, JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify({ file: record.file, status: r.status, bytes: record.bytesSanitized, redacted: record.redacted }));
  return clean;
}
(async () => {
  const args = process.argv.slice(2);
  if (args.length) { for (const url of args) await save(url); return; }
  const html = await save(target);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const src of [...new Set(scripts)]) {
    try { allowed(src); } catch { console.log('Skipped script outside allowed static resource scope'); continue; }
    await save(src);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
