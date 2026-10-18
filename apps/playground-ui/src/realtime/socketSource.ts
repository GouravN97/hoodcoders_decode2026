import { RunEventSchema, type RunEventType } from '@playground/shared';
import { io, type Socket } from 'socket.io-client';
import type { RunEventHandler, RunEventSource } from './eventSource';

const RUN_EVENT_TYPES: RunEventType[] = RunEventSchema.options.map((o) => o.shape.type.value);

/**
 * socket.io client for RunEventsGateway: one room per run, joined with `run.subscribe`.
 * Payloads are validated with the shared schema; invalid ones are dropped with a warning.
 */
export class SocketIoEventSource implements RunEventSource {
  private socket: Socket | null = null;

  constructor(private readonly url: string) {}

  private connect(): Socket {
    this.socket ??= io(this.url || undefined, { path: '/socket.io', transports: ['websocket'] });
    return this.socket;
  }

  subscribe(runId: string, handler: RunEventHandler, onReconnect?: () => void): () => void {
    const socket = this.connect();
    const join = () => socket.emit('run.subscribe', { runId });
    const listeners = RUN_EVENT_TYPES.map((type) => {
      const listener = (payload: unknown) => {
        const parsed = RunEventSchema.safeParse({ ...(payload as object), type });
        if (!parsed.success) {
          console.warn(`Dropped malformed ${type} event`, parsed.error);
          return;
        }
        if (parsed.data.runId === runId) handler(parsed.data);
      };
      socket.on(type, listener);
      return [type, listener] as const;
    });
    const reconnect = () => {
      join();
      onReconnect?.();
    };
    socket.on('connect', reconnect);
    if (socket.connected) join();

    return () => {
      socket.emit('run.unsubscribe', { runId });
      socket.off('connect', reconnect);
      for (const [type, listener] of listeners) socket.off(type, listener);
    };
  }
}
