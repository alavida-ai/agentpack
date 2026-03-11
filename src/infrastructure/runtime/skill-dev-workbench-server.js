import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const htmlPath = join(projectRoot, 'src', 'dashboard', 'index.html');
const bundlePath = join(projectRoot, 'src', 'dashboard', 'dist', 'dashboard.js');

async function ensureDashboardBundle() {
  await build({
    entryPoints: [join(projectRoot, 'src', 'dashboard', 'main.jsx')],
    bundle: true,
    format: 'esm',
    outfile: bundlePath,
    jsx: 'automatic',
  });
}

export async function startSkillDevWorkbenchServer({ buildModel, defaultSkill, onAction = null }) {
  await ensureDashboardBundle();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname === '/api/model') {
      const skillParam = parsedUrl.searchParams.get('skill') || defaultSkill;
      try {
        const model = buildModel(skillParam);
        if (!model) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Skill not found' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(model));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname.startsWith('/api/actions/')) {
      const action = parsedUrl.pathname.slice('/api/actions/'.length);
      res.writeHead(200, { 'content-type': 'application/json' });
      try {
        const result = onAction ? await onAction(action) : { refreshed: true };
        res.end(JSON.stringify({ ok: true, action, result }));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, action, error: error.message }));
      }
      return;
    }

    if (parsedUrl.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(htmlPath, 'utf-8'));
      return;
    }

    if (parsedUrl.pathname === '/assets/dashboard.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(readFileSync(bundlePath, 'utf-8'));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: address.port,
        url: `http://127.0.0.1:${address.port}`,
        close() {
          server.close();
        },
      });
    });
  });
}
