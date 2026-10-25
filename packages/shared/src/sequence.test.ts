import { describe, expect, it } from 'vitest';
import { ProtocolStep, type Exchange } from './domain';
import { buildSequence, sequenceMessages, toMermaid, type SequenceInput } from './sequence';

let seq = 0;
const ex = (
  step: ProtocolStep,
  from: string,
  component: string,
  over: Partial<Exchange> = {},
): SequenceInput['exchanges'][number] => ({
  id: `ex-${++seq}`,
  seq,
  from,
  component,
  method: 'POST',
  url: `https://test/${step}`,
  status: 200,
  step,
  outOfBand: false,
  ...over,
});

const catalog = [
  { id: 'inji-certify', displayName: 'Inji Certify', vendor: 'inji' as const },
  { id: 'hovi-playground', displayName: 'Hovi Playground', vendor: 'external' as const },
  { id: 'mock-wallet', displayName: 'Mock wallet', vendor: 'mock' as const },
  { id: 'inji-wallet-mobile', displayName: 'Inji Wallet (mobile)', vendor: 'inji' as const },
  { id: 'inji-verify', displayName: 'Inji Verify', vendor: 'inji' as const },
];

function fullRun(): SequenceInput {
  seq = 0;
  return {
    config: { issuerId: 'inji-certify', walletId: 'mock-wallet', verifierId: 'inji-verify' },
    catalog,
    steps: [],
    exchanges: [
      ex(ProtocolStep.VCI_CREDENTIAL_OFFER, 'bff', 'certify'),
      ex(ProtocolStep.VCI_CREDENTIAL_OFFER, 'bff', 'inji-certify', { method: 'OOB', outOfBand: true, status: undefined }),
      ex(ProtocolStep.VCI_TOKEN, 'wallet', 'certify'),
      ex(ProtocolStep.VCI_CREDENTIAL, 'wallet', 'certify'),
      ex(ProtocolStep.VERIFY_CREATE_REQUEST, 'bff', 'verify', { status: 201 }),
      ex(ProtocolStep.VP_AUTH_REQUEST, 'bff', 'verify', { method: 'OOB', outOfBand: true, status: undefined }),
      ex(ProtocolStep.VP_REQUEST_OBJECT, 'wallet', 'verify', { method: 'GET' }),
      ex(ProtocolStep.VP_RESPONSE, 'wallet', 'verify'),
      ex(ProtocolStep.VERIFY_STATUS, 'bff', 'verify', { method: 'GET' }),
      ex(ProtocolStep.VERIFY_STATUS, 'bff', 'verify', { method: 'GET' }),
      ex(ProtocolStep.VERIFY_RESULT, 'bff', 'verify', { method: 'GET' }),
    ],
  };
}

describe('buildSequence, OpenID4VP view', () => {
  it('shows Verifier ↔ Wallet ↔ Library with the library hand-off inferred, before the vp_token is sent', () => {
    const model = buildSequence(fullRun(), 'openid4vp');
    expect(model.lanes.map((l) => l.label)).toEqual([
      'Playground',
      'Inji Verify',
      'Mock wallet',
      'Mock wallet OpenID4VP code',
    ]);
    const msgs = sequenceMessages(model);
    // No issuance in this view.
    expect(msgs.some((m) => m.to === 'issuer')).toBe(false);
    const libraryIndex = msgs.findIndex((m) => m.to === 'library');
    const responseIndex = msgs.findIndex((m) => m.label.startsWith('Presentation response'));
    expect(libraryIndex).toBeGreaterThan(-1);
    expect(libraryIndex).toBeLessThan(responseIndex);
    expect(msgs.filter((m) => m.from === 'library' || m.to === 'library').every((m) => m.kind === 'inferred')).toBe(true);
    expect(msgs.filter((m) => m.kind === 'inferred').every((m) => m.exchangeId === undefined)).toBe(true);
  });

  it('collapses repeated status polls into one arrow that points at the last one', () => {
    const model = buildSequence(fullRun(), 'openid4vp');
    const poll = sequenceMessages(model).find((m) => m.label.startsWith('Status poll'));
    expect(poll).toMatchObject({ count: 2, exchangeId: 'ex-10' });
  });

  it('marks the out-of-band request and a failed exchange', () => {
    const input = fullRun();
    input.exchanges[7] = { ...input.exchanges[7]!, status: 400 };
    const msgs = sequenceMessages(buildSequence(input, 'openid4vp'));
    expect(msgs.find((m) => m.label.startsWith('Authorization request'))).toMatchObject({
      kind: 'out-of-band',
      from: 'playground',
      to: 'wallet',
    });
    expect(msgs.find((m) => m.label.startsWith('Presentation response'))?.kind).toBe('failed');
  });

  it('notes the wallet-hook tamper on the library lane and flags the tampered exchange', () => {
    const input = fullRun();
    input.tamper = { id: 'T-SIG-FLIP', label: 'Broken signature', mechanism: 'wallet-hook', expectedOutcome: 'INVALID', summary: 'Changed one character' };
    input.exchanges[7] = { ...input.exchanges[7]!, tampered: { ruleId: 'T-SIG-FLIP', diff: 'x' } };
    const model = buildSequence(input, 'openid4vp');
    expect(model.items).toContainEqual({ type: 'note', over: ['library'], text: 'T-SIG-FLIP: Changed one character' });
    expect(toMermaid(model)).toContain('W->>V: TAMPERED · Presentation response · 200');
  });
});

describe('buildSequence, full view', () => {
  it('draws captured issuance as observed arrows to the issuer', () => {
    const msgs = sequenceMessages(buildSequence(fullRun(), 'full'));
    expect(msgs[0]).toMatchObject({ from: 'playground', to: 'issuer', kind: 'observed', exchangeId: 'ex-1' });
    expect(msgs.find((m) => m.label.startsWith('Token exchange'))).toMatchObject({ from: 'wallet', to: 'issuer', kind: 'observed' });
  });

  it('never presents an external issuer’s unobserved traffic as captured', () => {
    seq = 0;
    const model = buildSequence(
      {
        config: { issuerId: 'hovi-playground', walletId: 'inji-wallet-mobile', verifierId: 'inji-verify' },
        catalog,
        exchanges: [ex(ProtocolStep.VCI_CREDENTIAL_OFFER, 'bff', 'hovi-playground', { method: 'OOB', outOfBand: true, status: undefined })],
        steps: [
          { step: ProtocolStep.VCI_TOKEN, status: 'done', evidenceKind: 'manual' },
          { step: ProtocolStep.VCI_CREDENTIAL, status: 'done', evidenceKind: 'manual' },
          { step: 'credential_held', status: 'done', evidenceKind: 'manual' },
        ],
      },
      'full',
    );
    const msgs = sequenceMessages(model);
    expect(msgs.filter((m) => m.to === 'issuer').map((m) => m.kind)).toEqual(['inferred', 'inferred']);
    expect(msgs.filter((m) => m.to === 'issuer').every((m) => m.label.includes('not observed (holder confirmed)'))).toBe(true);
    expect(model.lanes.find((l) => l.id === 'issuer')?.detail).toBe('outside the Protocol Tap');
    expect(model.items.some((i) => i.type === 'note' && i.text.includes('holder confirmed'))).toBe(true);
    const source = toMermaid(model);
    expect(source).toContain('W--)I');
    expect(source).not.toContain('W->>I');
  });

  it('attributes a Java client to Mimoto only when Inji Web is the wallet', () => {
    seq = 0;
    const input: SequenceInput = {
      config: { issuerId: 'inji-certify', walletId: 'mock-wallet', verifierId: 'inji-verify' },
      catalog,
      steps: [],
      exchanges: [ex(ProtocolStep.DID_RESOLUTION, 'mimoto', 'certify', { method: 'GET' })],
    };
    expect(buildSequence(input, 'full').lanes.map((l) => l.label)).toContain('Unidentified server client');
    expect(buildSequence({ ...input, config: { ...input.config, walletId: 'inji-web' } }, 'full').lanes.map((l) => l.id)).toContain('mimoto');
  });
});

describe('toMermaid', () => {
  it('declares participants with their detail and draws each kind of arrow', () => {
    const source = toMermaid(buildSequence(fullRun(), 'openid4vp'));
    expect(source.split('\n')[0]).toBe('sequenceDiagram');
    expect(source).toContain('participant V as Inji Verify<br/>(behind the Protocol Tap)');
    expect(source).toContain('P-)W: Authorization request (QR / link)');
    expect(source).toContain('W--)L: Request to library (inferred)');
    expect(source).toContain('P->>V: Status poll · 200 ×2');
  });

  it('strips characters Mermaid would read as syntax', () => {
    seq = 0;
    const source = toMermaid(
      buildSequence(
        {
          config: { issuerId: 'inji-certify', walletId: 'mock-wallet', verifierId: 'inji-verify' },
          catalog,
          steps: [],
          exchanges: [ex(ProtocolStep.UNKNOWN, 'wallet', 'certify', { url: 'https://x/a;b#c' })],
        },
        'full',
      ),
    );
    expect(source).not.toMatch(/[;#]/);
  });
});

describe('buildSequence, second opinion', () => {
  it('draws the other verifier’s second opinion as a note, not as a message to the run’s verifier', () => {
    const input = fullRun();
    input.exchanges.push(ex(ProtocolStep.VC_DIRECT_VERIFY, 'bff', 'mock-verifier'));
    const model = buildSequence(input, 'openid4vp');
    expect(sequenceMessages(model).some((m) => m.exchangeId === input.exchanges.at(-1)!.id)).toBe(false);
    expect(model.items.at(-1)).toMatchObject({ type: 'note', over: ['playground'], text: expect.stringContaining('Second opinion') });
  });
});
