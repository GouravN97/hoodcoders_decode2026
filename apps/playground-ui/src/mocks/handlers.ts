// MSW handlers for the BFF REST API (plan §11.2), backed by the mock db and simulator.
import {
  CreateRunRequestSchema,
  ManualEvidenceRequestSchema,
  PredictRequestSchema,
  RUN_STEP_TEMPLATE,
  renderReportMarkdown,
  type RunDetail,
} from '@playground/shared';
import { delay, http, HttpResponse } from 'msw';
import { BFF_URL } from '../config';
import { mockCatalog, predict } from './catalog';
import { db } from './db';
import { CREDENTIAL_CONFIGURATIONS } from './fixtures';
import { buildRunReport } from './report';
import { confirmManualEvidence, startSimulation } from './simulator';

const api = (path: string) => `${BFF_URL}/api${path}`;
const error = (statusCode: number, message: string) =>
  HttpResponse.json({ message, statusCode }, { status: statusCode });

export const handlers = [
  http.get(api('/catalog'), async () => {
    await delay(150);
    return HttpResponse.json(mockCatalog);
  }),

  http.get(api('/catalog/:id/credential-configurations'), ({ params }) => {
    const entry = mockCatalog.find((c) => c.id === params.id);
    if (!entry || entry.role !== 'issuer') return error(404, `Unknown issuer ${String(params.id)}`);
    return HttpResponse.json(
      CREDENTIAL_CONFIGURATIONS.filter((c) => entry.capabilities.formats.includes(c.format)).map(
        (c) => ({
          id: c.id,
          format: c.format,
          displayName: c.displayName,
          credentialType: c.credentialType,
          proofSuites: [c.proofSuite],
          ...(c.validitySeconds ? { validitySeconds: c.validitySeconds } : {}),
        }),
      ),
    );
  }),

  http.post(api('/compatibility/predict'), async ({ request }) => {
    const parsed = PredictRequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, 'Invalid run config');
    await delay(120);
    return HttpResponse.json(predict(parsed.data));
  }),

  http.post(api('/runs'), async ({ request }) => {
    const parsed = CreateRunRequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, `Invalid run config: ${parsed.error.issues[0]?.message}`);
    const config = parsed.data;
    const wallet = mockCatalog.find((c) => c.id === config.walletId && c.role === 'wallet');
    const ids = [config.issuerId, config.walletId, config.verifierId];
    if (!wallet || ids.some((id) => !mockCatalog.some((c) => c.id === id))) {
      return error(400, 'Unknown implementation in run config');
    }
    const run: RunDetail = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      trigger: 'ui',
      config,
      state: 'Configured',
      prediction: predict(config),
      correlation: config.walletId === 'inji-web' ? 'heuristic' : 'exact',
      steps: RUN_STEP_TEMPLATE.map((t) => ({ phase: t.phase, step: t.step, status: 'pending' as const })),
      versions: ids.map((id) => ({
        implementationId: id,
        version: mockCatalog.find((c) => c.id === id)?.version ?? 'unknown',
      })),
      artifacts: [],
    };
    const record = db.create(run);
    await delay(250);
    void startSimulation(record, wallet);
    return HttpResponse.json({ id: run.id }, { status: 201 });
  }),

  http.get(api('/runs/:id'), ({ params }) => {
    const record = db.get(String(params.id));
    return record ? HttpResponse.json(record.run) : error(404, 'Run not found');
  }),

  http.get(api('/runs/:id/exchanges'), ({ params }) => {
    const record = db.get(String(params.id));
    return record ? HttpResponse.json(record.exchanges) : error(404, 'Run not found');
  }),

  http.post(api('/runs/:id/manual-evidence'), async ({ params, request }) => {
    const parsed = ManualEvidenceRequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, 'Invalid manual evidence');
    if (!db.get(String(params.id))) return error(404, 'Run not found');
    if (!confirmManualEvidence(String(params.id), parsed.data.step)) {
      return error(409, `Step ${parsed.data.step} is not waiting for confirmation`);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(api('/runs/:id/cancel'), ({ params }) => {
    const record = db.get(String(params.id));
    if (!record) return error(404, 'Run not found');
    record.cancelled = true;
    return new HttpResponse(null, { status: 202 });
  }),

  http.get(api('/runs/:id/report'), ({ params, request }) => {
    const record = db.get(String(params.id));
    if (!record) return error(404, 'Run not found');
    const report = buildRunReport(record, mockCatalog);
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    if (format === 'md') {
      return new HttpResponse(renderReportMarkdown(report), {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="run-${report.runId}.md"`,
        },
      });
    }
    return HttpResponse.json(report, {
      headers: { 'content-disposition': `attachment; filename="run-${report.runId}.json"` },
    });
  }),
];
