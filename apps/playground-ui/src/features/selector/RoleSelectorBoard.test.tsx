import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockCatalog } from '../../mocks/catalog';
import { useSelection } from '../../store/selection';
import { RoleSelectorBoard } from './RoleSelectorBoard';

const row = (role: string) => screen.getByRole('group', { name: role });

describe('RoleSelectorBoard', () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({ issuerId: undefined, walletId: undefined, verifierId: undefined });
  });

  it('stacks one row per role, in order, each starting with nothing chosen', () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Issuer', 'Wallet', 'Verifier']);
    for (const role of ['Issuer', 'Wallet', 'Verifier']) {
      expect(within(row(role)).getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
      expect(within(row(role)).getByText(/none chosen/)).toBeInTheDocument();
    }
    const state = useSelection.getState();
    expect([state.issuerId, state.walletId, state.verifierId]).toEqual([undefined, undefined, undefined]);
  });

  it('shows every wallet as a card with its name, status and description', () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    expect(within(row('Wallet')).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Inji Wallet (mobile)',
      'Inji Web',
      'Mock wallet',
    ]);
    const card = screen.getByTestId('choice-mock-wallet');
    expect(card).toHaveTextContent('Online');
    expect(card).toHaveTextContent('Headless test wallet');
  });

  it('chooses a card on click and clears back to none', async () => {
    render(<RoleSelectorBoard catalog={mockCatalog} />);
    await userEvent.click(screen.getByTestId('choice-mock-wallet'));
    expect(useSelection.getState().walletId).toBe('mock-wallet');
    expect(within(row('Wallet')).getByRole('radio', { name: 'Mock wallet' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Clear wallet' }));
    expect(useSelection.getState().walletId).toBeUndefined();
  });

  it('lights up a role row only once a service is chosen for it', async () => {
    const { container } = render(<RoleSelectorBoard catalog={mockCatalog} />);
    const rows = () => [...container.querySelectorAll('[data-active]')].map((el) => el.getAttribute('data-active'));
    expect(rows()).toEqual(['false', 'false', 'false']);
    await userEvent.click(screen.getByTestId('choice-inji-verify'));
    expect(rows()).toEqual(['false', 'false', 'true']);
  });

  it('disables an offline implementation and says why on its card', () => {
    const catalog = mockCatalog.map((c) => (c.id === 'inji-web' ? { ...c, health: 'down' as const } : c));
    render(<RoleSelectorBoard catalog={catalog} />);
    expect(screen.getByRole('radio', { name: 'Inji Web' })).toBeDisabled();
    expect(screen.getByTestId('choice-inji-web')).toHaveTextContent('Offline');
    expect(screen.getByTestId('choice-inji-web')).toHaveTextContent('Inji Web is not responding');
  });
});
