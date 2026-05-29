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

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    // Defer URL parsing to Next; it handles WHATWG URL internally.
    handle(req, res);
  });

  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: '/api/socket',
    cors: { origin: true, credentials: true },
  });

  attachHandlers(io);

  httpServer.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> PAL/Tri-Lam Euchre Club server ready on http://${hostname}:${port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
