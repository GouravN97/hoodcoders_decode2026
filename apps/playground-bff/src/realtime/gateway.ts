// RunEventsGateway (plan §11.3): socket.io, one room per run. Clients join with
// `run.subscribe { runId }` and leave with `run.unsubscribe`; every RunEvent is emitted under its
// `type` as the event name. `catalog.health` goes to every client.
import type { Server as HttpServer } from 'node:http';
import type { CatalogHealthEvent, Exchange, RunEvent } from '@playground/shared';
import { Server } from 'socket.io';
import { exchangeEvents } from '../store/exchange-store.ts';
import { publish, runEvents } from '../runs/store.ts';

const room = (runId: string) => `run:${runId}`;

export function attachGateway(http: HttpServer, corsOrigins: string[] | '*'): Server {
  const io = new Server(http, { path: '/socket.io', cors: { origin: corsOrigins } });

  io.on('connection', (socket) => {
    socket.on('run.subscribe', (msg: { runId?: unknown }) => {
      if (typeof msg?.runId === 'string') void socket.join(room(msg.runId));
    });
    socket.on('run.unsubscribe', (msg: { runId?: unknown }) => {
      if (typeof msg?.runId === 'string') void socket.leave(room(msg.runId));
    });
  });

  runEvents.on('event', (event: RunEvent) => io.to(room(event.runId)).emit(event.type, event));

  // Exchanges become run.exchange summaries; the UI fetches full bodies on demand.
  exchangeEvents.on('run-exchange', (ex: Exchange) => {
    if (!ex.runId) return;
    const { request, response, ...summary } = ex;
    publish({
      type: 'run.exchange',
      runId: ex.runId,
      exchange: {
        ...summary,
        requestBytes: Buffer.byteLength(request.body ?? ''),
        responseBytes: Buffer.byteLength(response?.body ?? ''),
      },
    });
  });

  return io;
}

export const broadcastHealth = (io: Server, event: Omit<CatalogHealthEvent, 'type'>) =>
  io.emit('catalog.health', { type: 'catalog.health', ...event });
