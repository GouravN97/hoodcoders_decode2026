import type {
  CredentialFormat,
  PresentationFlow,
  Role,
  VerificationOutcome,
} from '@playground/shared';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface SelectionState {
  issuerId?: string;
  walletId?: string;
  verifierId?: string;
  format?: CredentialFormat;
  credentialConfigurationId?: string;
  presentationFlow: PresentationFlow;
  expectedOutcome: VerificationOutcome;
  /** Pass undefined to set the role back to None. */
  select: (role: Role, id: string | undefined) => void;
  update: (patch: Partial<Omit<SelectionState, 'select' | 'update'>>) => void;
}

const ROLE_KEY = { issuer: 'issuerId', wallet: 'walletId', verifier: 'verifierId' } as const;

/** localStorage that never throws (private windows, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* selection simply isn't remembered */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      presentationFlow: 'cross-device-qr',
      expectedOutcome: 'VALID',
      select: (role, id) => set({ [ROLE_KEY[role]]: id }),
      update: (patch) => set(patch),
    }),
    {
      name: 'playground.selection',
      storage: createJSONStorage(() => safeStorage),
      // Issuer, wallet and verifier start at None on every visit; only the run settings are remembered.
      partialize: ({ issuerId: _i, walletId: _w, verifierId: _v, ...rest }) => rest,
      version: 2,
      migrate: (persisted) => {
        const { issuerId: _i, walletId: _w, verifierId: _v, ...rest } = (persisted ?? {}) as Partial<SelectionState>;
        return rest as SelectionState;
      },
    },
  ),
);

export const selectedIdFor = (s: SelectionState, role: Role) => s[ROLE_KEY[role]];
