import { render, screen, within } from '@testing-library/react';
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

  it('renders one column per role from the catalog and defaults each selection', () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    for (const role of ['Issuer', 'Wallet', 'Verifier']) expect(screen.getByRole('group', { name: new RegExp(role) })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Inji Certify/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Inji Verify/ })).toBeChecked();
    expect(useSelection.getState().walletId).toBeDefined();
  });

  it('selects a wallet on click', async () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    const wallets = screen.getByRole('group', { name: /Wallet/ });
    await userEvent.click(within(wallets).getByText('Mock wallet'));
    expect(useSelection.getState().walletId).toBe('mock-wallet');
    expect(within(wallets).getByRole('radio', { name: /Mock wallet/ })).toBeChecked();
  });

  it('disables an offline implementation and says why', () => {
    const catalog = mockCatalog.map((c) => (c.id === 'inji-web' ? { ...c, health: 'down' as const } : c));
    render(<RoleSelectorBoard catalog={catalog} />);
    expect(screen.getByRole('radio', { name: /Inji Web/ })).toBeDisabled();
    expect(screen.getByText('Inji Web is not responding')).toBeInTheDocument();
  });
});
