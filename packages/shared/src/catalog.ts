// Catalog of implementations (one YAML file per implementation in /catalog) and what the
// BFF adds at runtime: health, probed version and compatibility predictions.
import { z } from 'zod';
import {
  CredentialFormatSchema,
  ImplementationDescriptorSchema,
  ProofSuiteSchema,
  RoleSchema,
} from './domain';

/**
 * Catalog values may reference the environment as ${VAR} or ${VAR:-default}, so the same files
 * describe `pnpm dev` and the Docker Compose stack. Without an environment (the browser mocks) the
 * defaults apply.
 */
export function interpolateEnv(text: string, env: Record<string, string | undefined> = {}): string {
  return text.replace(
    /\$\{(\w+)(?::-([^}]*))?\}/g,
    (_, name: string, fallback?: string) => env[name] || fallback || '',
  );
}

/** Schema of a `catalog/*.yaml` file. */
export const CatalogFileSchema = ImplementationDescriptorSchema;

export const HealthStatusSchema = z.enum(['up', 'down', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const CatalogEntrySchema = ImplementationDescriptorSchema.extend({
  health: HealthStatusSchema,
  version: z.string().optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const CredentialConfigurationSummarySchema = z.object({
  id: z.string(),
  format: CredentialFormatSchema,
  displayName: z.string(),
  /** `type` for ldp_vc, `vct` for SD-JWT. */
  credentialType: z.string().optional(),
  proofSuites: z.array(ProofSuiteSchema),
  /** Validity in seconds, when the issuer config fixes it (used for Valid-but-Expired demos). */
  validitySeconds: z.number().optional(),
});
export type CredentialConfigurationSummary = z.infer<typeof CredentialConfigurationSummarySchema>;

export const PredictionStatusSchema = z.enum(['supported', 'unsupported', 'unknown']);
export type PredictionStatus = z.infer<typeof PredictionStatusSchema>;

export const PredictionSchema = z.object({
  status: PredictionStatusSchema,
  reasons: z.array(
    z.object({
      role: RoleSchema.optional(),
      severity: z.enum(['info', 'warn', 'error']),
      message: z.string(),
    }),
  ),
});
export type Prediction = z.infer<typeof PredictionSchema>;
