import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAssessmentService } from './assessment-service.js';
import { deploymentConfig, securityHeaders, clientAddress, createRateLimiter } from './server-security.js';
import { createAccounts } from './accounts.js';
import { createRecordStore } from './record-store.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = new Set(['index.html', 'style.css', 'app.js', 'core.js', 'calculator.js', 'learning.js', 'lessons.js', 'host-tools.js', 'messages.js', 'guide.html', 'assessment.html', 'assessment-client.js', 'verify.html', 'verify.js', 'courses.html', 'security.html', 'security.js', 'security-core.js', 'security-motion.js', 'security-class.js', 'practical-checks.js', 'pilot.html', 'pilot.js', 'account.html', 'account-client.js', 'account-nav.js', 'privacy.html']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
for (const file of ['fundamentals.html', 'fundamentals.css', 'fundamentals.js', 'network-lessons.js', 'ip-teaching.js', 'ip-teaching-core.js', 'ipv6-lab.js', 'lab-workbench.js', 'course-practice.js', 'course-practice-models.js', 'switching.js', 'switching-core.js', 'operations-core.js', 'operations-courses.js', 'replay.js', 'practice-records.js', 'course-catalog.js']) publicFiles.add(file);
for (const file of ['systems.html', 'systems.js', 'systems-labs.js', 'systems-models.js']) publicFiles.add(file);
export function createLabServer(config = deploymentConfig()) {
const dataDir = path.resolve(process.env.NETWORK_LAB_DATA_DIR || path.join(root, '.assessment-data'));
const dataRelative = path.relative(root, dataDir);
if (config.production && (!dataRelative || (!dataRelative.startsWith('..' + path.sep) && !path.isAbsolute(dataRelative)))) throw Error('Production data must be outside the application directory.');
const records = createRecordStore(dataDir);
const assessment = createAssessmentService(root, dataDir, (req, type, detail) => accounts.record(req.account, type, detail), records);
const accounts = createAccounts(dataDir, process.env, undefined, records);
const allow = createRateLimiter();
const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  securityHeaders(res, config.production);
  const requestId = randomUUID(); res.setHeader('X-Request-ID', requestId);
  const reject = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
  try {
    if (config.origin && req.headers.host !== new URL(config.origin).host) return reject(421, 'Unexpected host.');
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return reject(405, 'Method not allowed.'); }
    if (pathname === '/health/live' || pathname === '/health/ready') {
      if (pathname.endsWith('ready')) { await access(dataDir, constants.R_OK | constants.W_OK); await records.ready(); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"status":"ok"}'); return;
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
      const ip = clientAddress(req, config.proxy);
      if (!allow(ip + ':api', 180) || (['/api/register', '/api/retake', '/api/submit'].includes(pathname) && !allow(ip + ':attempt', 15)) || (pathname === '/api/certificate' && !allow(ip + ':pdf', 10))) {
        res.setHeader('Retry-After', '60'); return reject(429, 'Too many requests. Wait before retrying.');
      }
      if (req.method === 'HEAD') return reject(405, 'Use GET for API reads.');
      if (await accounts.route(req, res, pathname)) return;
      req.account = await accounts.current(req);
      if (!pathname.startsWith('/api/verify/') && !req.account) return reject(401, 'Sign in before starting an assessment.');
      await assessment(req, res, pathname); return;
    }
    if (req.method === 'POST') return reject(405, 'Static resources are read-only.');
    const relative = pathname === '/' ? 'courses.html' : pathname.slice(1);
    if (!publicFiles.has(relative) && !/^(assets|vendor)\/[a-zA-Z0-9_./-]+\.(webp|png|jpg|jpeg|js|ttf)$/.test(relative)) { res.writeHead(404); res.end('Not found'); return; }
    const target = path.resolve(root, '.' + (pathname === '/' ? '/courses.html' : pathname));
    if (!target.startsWith(root) || pathname.includes('node_modules') || pathname.includes('/.')) { res.writeHead(403); res.end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') return reject(404, 'Not found.');
    if (error instanceof URIError) return reject(400, 'Malformed URL.');
    console.error(JSON.stringify({ event: 'request_error', requestId, code: error.code || 'INTERNAL' }));
    reject(503, 'Service temporarily unavailable.');
  }
});
server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxRequestsPerSocket = 100;
server.on('close', () => { void records.close().catch(() => console.error('{"event":"training_database_close_error"}')); });
return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = deploymentConfig();
  const server = createLabServer(config);
  server.listen(config.port, config.host, () => console.log(`Network Workshop: ${config.origin || `http://${config.host}:${server.address().port}`}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15000).unref();
  });
}
