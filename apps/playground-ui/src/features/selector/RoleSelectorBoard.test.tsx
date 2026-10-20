import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockCatalog } from '../../mocks/catalog';
import { useSelection } from '../../store/selection';
import { RoleSelectorBoard } from './RoleSelectorBoard';

describe('RoleSelectorBoard', () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({ issuerId: undefined, walletId: undefined, verifierId: undefined });
  });

  it('renders one dropdown per role, each starting at None', () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    for (const role of ['Issuer', 'Wallet', 'Verifier']) {
      const select = screen.getByRole('combobox', { name: role });
      expect(select).toHaveValue('');
      expect(screen.getByText(`No ${role.toLowerCase()} selected`)).toBeInTheDocument();
    }
    const state = useSelection.getState();
    expect([state.issuerId, state.walletId, state.verifierId]).toEqual([undefined, undefined, undefined]);
  });

  it('lists every catalog entry for the role and selects one', async () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    const wallets = screen.getByRole('combobox', { name: 'Wallet' });
    expect([...wallets.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'None',
      'Inji Wallet (mobile)',
      'Inji Web',
      'Mock wallet',
    ]);
    await userEvent.selectOptions(wallets, 'Mock wallet');
    expect(useSelection.getState().walletId).toBe('mock-wallet');
    expect(screen.getByTestId('selected-wallet')).toHaveTextContent('Mock wallet');
  });

  it('goes back to None when None is chosen', async () => {
    useSelection.setState({ issuerId: 'inji-certify' });
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Issuer' }), 'None');
    expect(useSelection.getState().issuerId).toBeUndefined();
  });

  it('disables an offline implementation and says why', () => {
    const catalog = mockCatalog.map((c) => (c.id === 'inji-web' ? { ...c, health: 'down' as const } : c));
    render(<RoleSelectorBoard catalog={catalog} />);
    expect(screen.getByRole('option', { name: 'Inji Web (unavailable)' })).toBeDisabled();
    expect(screen.getByText('Inji Web is not responding')).toBeInTheDocument();
  });
});
