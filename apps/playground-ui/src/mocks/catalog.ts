// Mock catalog: built from the real /catalog/*.yaml files, so adding a YAML entry adds a
// card in the selector even before the BFF exists.
import {
  CatalogFileSchema,
  interpolateEnv,
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

const MOCK_HEALTH: Record<string, HealthStatus> = {};

export const mockCatalog: CatalogEntry[] = Object.entries(files)
  .map(([path, text]): CatalogEntry | null => {
    // ${VAR:-default} values take their defaults here, as the BFF does without that variable.
    const parsed = CatalogFileSchema.safeParse(parse(interpolateEnv(text)));
    if (!parsed.success) {
      console.error(`Invalid catalog file ${path}`, parsed.error);
      return null;
    }
    const d = parsed.data;
    // The pinned version from the YAML, as the BFF's static version probe reports it.
    const version = d.versionProbe?.kind === 'static' ? d.versionProbe.value : 'unknown';
    return { ...d, health: MOCK_HEALTH[d.id] ?? 'up', version };
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
