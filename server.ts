/* Custom Next.js server that also hosts a Socket.io server on the same port.
 * Run via `tsx server.ts` (configured in package.json scripts).
 */
import { createServer } from 'http';
import { loadEnvConfig } from '@next/env';
import next from 'next';

// Load .env* into process.env before anything reads it (e.g. DATABASE_URL for
// the stats store). On Render the env var is injected directly; locally this
// picks it up from .env. Safe to call early — the DB pool is created lazily.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
import { Server as IOServer } from 'socket.io';
import { attachHandlers } from './src/server/handlers';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './src/lib/shared-types';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3000);

/** Browser origins allowed to open a socket. ALLOWED_ORIGINS (comma-separated)
 *  wins; on Render we fall back to RENDER_EXTERNAL_URL; in dev, localhost. */
function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const render = process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '');
  if (render) return [render];
  if (dev) return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  return [];
}

// Last line of defence: the socket handlers are individually wrapped, so
// anything reaching here is a genuine bug. Log loudly rather than let one bad
// packet take every table down; Render's health check restarts a wedged process.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (e) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException:', e);
});

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    // Defer URL parsing to Next; it handles WHATWG URL internally.
    handle(req, res);
  });

  const origins = allowedOrigins();
  const originAllowed = (origin: string | undefined): boolean => {
    // Non-browser clients (no Origin header) and same-origin requests are fine.
    if (!origin) return true;
    if (origins.length === 0) return true; // unconfigured: don't lock ourselves out
    return origins.includes(origin.replace(/\/$/, ''));
  };

  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: '/api/socket',
    cors: { origin: origins.length ? origins : true, credentials: true },
    // Browsers don't apply CORS to WebSocket upgrades, so check Origin here too.
    allowRequest: (req, cb) => {
      const ok = originAllowed(req.headers.origin);
      cb(ok ? null : 'origin not allowed', ok);
    },
    // Keep a single client from holding a large buffered payload in memory.
    maxHttpBufferSize: 64 * 1024,
  });

  attachHandlers(io);

  httpServer.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(
      `> PAL/Tri-Lam Euchre Club server ready on http://${hostname}:${port}` +
        (origins.length ? ` (origins: ${origins.join(', ')})` : ' (origin check off)')
    );
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
