// ImplementationRegistry (plan §8.2): loads catalog/*.yaml, validates each file with the shared
// zod schema, instantiates its adapter and keeps health and version fresh.
//
// Catalog values may reference the environment as ${VAR} or ${VAR:-default}, so the same files
// describe `pnpm dev` and the Docker Compose stack.
import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CatalogFileSchema,
  interpolateEnv,
  type CatalogEntry,
  type HealthStatus,
  type ImplementationDescriptor,
} from '@playground/shared';
import { parse } from 'yaml';
import { InjiCertifyIssuerAdapter } from '../adapters/inji-certify.ts';
import { InjiVerifyServiceAdapter } from '../adapters/inji-verify.ts';
import { InjiVerifyDcqlAdapter } from '../adapters/inji-verify-dcql.ts';
import { MockVerifierAdapter } from '../adapters/mock-verifier.ts';
import {
  AnimoPlaygroundIssuerAdapter,
  HoviPlaygroundIssuerAdapter,
} from '../adapters/external-playgrounds.ts';
import type {
  AnyAdapter,
  IssuerAdapter,
  VerifierAdapter,
  WalletAdapter,
} from '../adapters/types.ts';
import {
  InjiMobileWalletAdapter,
  InjiWebWalletAdapter,
  MockWalletAdapter,
  ParadymWalletAdapter,
} from '../adapters/wallets.ts';

export interface AdapterSettings {
  /**
   * Where the BFF calls each implementation, by catalog id: its Protocol Tap listener, so the calls
   * appear in the inspector. Without one, adapters call the implementation's internal URL directly.
   */
  apiUrls: Record<string, string | undefined>;
  verifyClientId: string;
  hoviSupabaseUrl?: string;
  hoviSupabaseAnonKey?: string;
}

type Factory = (d: ImplementationDescriptor, s: AdapterSettings) => AnyAdapter;

const apiUrl = (d: ImplementationDescriptor, s: AdapterSettings) =>
  s.apiUrls[d.id] || d.internalUrl || d.publicUrl;

const FACTORIES: Record<string, Factory> = {
  InjiCertifyIssuerAdapter: (d, s) => new InjiCertifyIssuerAdapter(d, apiUrl(d, s)),
  InjiVerifyServiceAdapter: (d, s) =>
    new InjiVerifyServiceAdapter(d, apiUrl(d, s), s.verifyClientId),
  InjiVerifyDcqlAdapter: (d, s) => new InjiVerifyDcqlAdapter(d, apiUrl(d, s)),
  MockVerifierAdapter: (d, s) => new MockVerifierAdapter(d, apiUrl(d, s)),
  HoviPlaygroundIssuerAdapter: (d, s) =>
    new HoviPlaygroundIssuerAdapter(d, {
      supabaseUrl: s.hoviSupabaseUrl,
      anonKey: s.hoviSupabaseAnonKey,
    }),
  AnimoPlaygroundIssuerAdapter: (d) => new AnimoPlaygroundIssuerAdapter(d),
  InjiMobileWalletAdapter: (d) => new InjiMobileWalletAdapter(d),
  InjiWebWalletAdapter: (d) => new InjiWebWalletAdapter(d),
  MockWalletAdapter: (d) => new MockWalletAdapter(d),
  ParadymWalletAdapter: (d) => new ParadymWalletAdapter(d),
};

interface Slot {
  descriptor: ImplementationDescriptor;
  adapter: AnyAdapter;
  health: HealthStatus;
  version?: string;
}

export class ImplementationRegistry extends EventEmitter {
  private readonly slots = new Map<string, Slot>();
  private lastRefresh = 0;
  private refreshing?: Promise<void>;

  constructor(dir: string, settings: AdapterSettings) {
    super();
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .sort()) {
      const parsed = CatalogFileSchema.safeParse(
        parse(interpolateEnv(readFileSync(join(dir, file), 'utf8'), process.env)),
      );
      if (!parsed.success) {
        console.error(
          `[catalog] ${file} is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
        continue;
      }
      const d = parsed.data;
      const factory = FACTORIES[d.adapter];
      if (!factory) {
        console.error(`[catalog] ${file}: no adapter named ${d.adapter}`);
        continue;
      }
      this.slots.set(d.id, { descriptor: d, adapter: factory(d, settings), health: 'unknown' });
    }
    console.log(`[catalog] loaded ${[...this.slots.keys()].join(', ')}`);
  }

  /** Probes health and versions; at most one refresh in flight. Emits 'health' for changes. */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      await Promise.all(
        [...this.slots.values()].map(async (slot) => {
          const [health, version] = await Promise.all([
            slot.adapter.healthCheck(),
            slot.adapter.version(),
          ]);
          const changed = health !== slot.health || version !== slot.version;
          slot.health = health;
          slot.version = version;
          if (changed)
            this.emit('health', {
              implementationId: slot.descriptor.id,
              status: health,
              ...(version ? { version } : {}),
            });
        }),
      );
      this.lastRefresh = Date.now();
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  /** Catalog entries, refreshing health first when it is older than `maxAgeMs`. */
  async list(maxAgeMs = 10_000): Promise<CatalogEntry[]> {
    if (Date.now() - this.lastRefresh > maxAgeMs) await this.refresh();
    return [...this.slots.values()]
      .map((s) => ({
        ...s.descriptor,
        health: s.health,
        ...(s.version ? { version: s.version } : {}),
      }))
      .sort((a, b) =>
        a.vendor === b.vendor
          ? a.displayName.localeCompare(b.displayName)
          : a.vendor === 'inji'
            ? -1
            : 1,
      );
  }

  get(id: string): Slot | undefined {
    return this.slots.get(id);
  }

  issuer(id: string): IssuerAdapter | undefined {
    const s = this.slots.get(id);
    return s?.descriptor.role === 'issuer' ? (s.adapter as IssuerAdapter) : undefined;
  }

  wallet(id: string): WalletAdapter | undefined {
    const s = this.slots.get(id);
    return s?.descriptor.role === 'wallet' ? (s.adapter as WalletAdapter) : undefined;
  }

  verifier(id: string): VerifierAdapter | undefined {
    const s = this.slots.get(id);
    return s?.descriptor.role === 'verifier' ? (s.adapter as VerifierAdapter) : undefined;
  }
}
