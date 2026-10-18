import { BFF_URL, USE_MOCKS } from '../config';
import { SimulatedEventSource, type RunEventSource } from './eventSource';
import { SocketIoEventSource } from './socketSource';

/** Shared bus the mock simulator publishes to. */
export const simulatedEvents = new SimulatedEventSource();

export const runEventSource: RunEventSource = USE_MOCKS
  ? simulatedEvents
  : new SocketIoEventSource(BFF_URL);
