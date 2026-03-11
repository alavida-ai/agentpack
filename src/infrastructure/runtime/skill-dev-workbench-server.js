import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentpackError } from '../../utils/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const htmlPath = join(projectRoot, 'src', 'dashboard', 'index.html');
const bundlePath = process.env.AGENTPACK_DASHBOARD_BUNDLE_PATH
  ? resolve(process.cwd(), process.env.AGENTPACK_DASHBOARD_BUNDLE_PATH)
  : join(projectRoot, 'src', 'dashboard', 'dist', 'dashboard.js');

function ensureDashboardBundle() {
  if (existsSync(bundlePath)) return;

  throw new AgentpackError('Skill workbench bundle is missing from this install', {
    code: 'missing_skill_workbench_bundle',
    suggestion: 'Reinstall agentpack or rebuild the dashboard bundle before starting skills dev.',
    path: 'src/dashboard/dist/dashboard.js',
  });
}

export async function startSkillDevWorkbenchServer({ model, onAction = null }) {
  let currentModel = model;
  ensureDashboardBundle();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.url === '/api/model') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(currentModel));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/actions/')) {
      const action = req.url.slice('/api/actions/'.length);
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

    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(htmlPath, 'utf-8'));
      return;
    }

    if (req.url === '/assets/dashboard.js') {
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
        updateModel(nextModel) {
          currentModel = nextModel;
        },
        close() {
          server.close();
        },
      });
    });
  });
}
