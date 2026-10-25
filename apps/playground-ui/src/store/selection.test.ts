import { beforeEach, describe, expect, it } from 'vitest';
import { useSelection } from './selection';

describe('selection store', () => {
  beforeEach(() => localStorage.clear());

  it('does not remember the tamper or the expected result across visits', () => {
    useSelection.getState().update({
      format: 'vc+sd-jwt',
      tamper: { id: 'T-SIG-FLIP' },
      expectedOutcome: 'INVALID',
    });
    const saved = JSON.parse(localStorage.getItem('playground.selection') ?? '{}') as { state: Record<string, unknown> };
    expect(saved.state.format).toBe('vc+sd-jwt');
    expect(saved.state).not.toHaveProperty('tamper');
    expect(saved.state).not.toHaveProperty('expectedOutcome');
  });
});
