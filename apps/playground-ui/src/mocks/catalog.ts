// Mock catalog: built from the real /catalog/*.yaml files, so adding a YAML entry adds a
// card in the selector even before the BFF exists.
import {
  CatalogFileSchema,
  predict as predictCompatibility,
  type CatalogEntry,
  type HealthStatus,
  type Prediction,
  type PredictContext,
  type RunConfig,
} from '@playground/shared';
import { parse } from 'yaml';

const files = import.meta.glob('../../../../catalog/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Versions a ModuleVersionProbe would report; mock values. */
const MOCK_VERSIONS: Record<string, string> = {
  'inji-certify': '0.12.1',
  'inji-wallet-mobile': '0.17.0',
  'inji-web': '0.13.0',
  'inji-verify': '0.18.1',
  'mock-wallet': '0.0.0-dev',
};
const MOCK_HEALTH: Record<string, HealthStatus> = {};

export const mockCatalog: CatalogEntry[] = Object.entries(files)
  .map(([path, text]): CatalogEntry | null => {
    const parsed = CatalogFileSchema.safeParse(parse(text));
    if (!parsed.success) {
      console.error(`Invalid catalog file ${path}`, parsed.error);
      return null;
    }
    const d = parsed.data;
    return { ...d, health: MOCK_HEALTH[d.id] ?? 'up', version: MOCK_VERSIONS[d.id] ?? 'unknown' };
  })
  .filter((e): e is CatalogEntry => e !== null)
  .sort((a, b) =>
    a.vendor === b.vendor
      ? a.displayName.localeCompare(b.displayName)
      : a.vendor === 'inji'
        ? -1
        : 1,
  );

/** The shared CompatibilityResolver over the mock catalog. */
export const predict = (config: RunConfig, context: PredictContext = {}): Prediction =>
  predictCompatibility(config, mockCatalog, context);
