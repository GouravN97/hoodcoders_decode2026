// Wallet adapters. Human-in-the-loop wallets only get delivery instructions (QR code, link);
// their progress is observed through the Protocol Tap. The mock wallet is driven over its REST
// API (apps/mock-wallet) and runs without a person.
import {
  HeldCredentialSchema,
  MockWalletErrorSchema,
  RespondResponseSchema,
  type DeliveryInstruction,
  type ImplementationDescriptor,
  type MockWalletTamper,
  type RespondRequest,
} from '@playground/shared';
import { z } from 'zod';
import { AdapterError, probeHealth, staticVersion } from './http.ts';
import type {
  IssuanceHandle,
  PresentationRequestHandle,
  RunContext,
  WalletAdapter,
} from './types.ts';

const byteLength = (s: string) => Buffer.byteLength(s, 'utf8');

/** Smallest QR version (byte mode, error correction L) that fits the payload. */
export function qrVersionFor(bytes: number): number {
  const capacity = [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
    929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
    2563, 2699, 2809, 2953,
  ];
  const i = capacity.findIndex((c) => c >= bytes);
  return i === -1 ? 41 : i + 1;
}

export function qr(
  payload: string,
  hint: string,
  ttlMs = 300_000,
  expiresAt?: string,
): DeliveryInstruction {
  const bytes = byteLength(payload);
  return {
    kind: 'qr',
    payload,
    bytes,
    qrVersion: qrVersionFor(bytes),
    hint,
    expiresAt: expiresAt ?? new Date(Date.now() + ttlMs).toISOString(),
  };
}

abstract class HumanWalletAdapter implements WalletAdapter {
  constructor(readonly descriptor: ImplementationDescriptor) {}

  healthCheck() {
    return probeHealth(this.descriptor.internalUrl);
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  abstract issuanceDelivery(handle: IssuanceHandle): DeliveryInstruction;

  presentationDelivery(ctx: RunContext, handle: PresentationRequestHandle): DeliveryInstruction {
    return ctx.config.presentationFlow === 'same-device-deeplink'
      ? {
          kind: 'deeplink',
          url: handle.authorizationRequestUri,
          hint: 'On the phone that holds the credential, tap the link to open the wallet and approve sharing.',
        }
      : qr(
          handle.authorizationRequestUri,
          'In the wallet, tap “Share” → “Scan QR code”, scan this request and approve sharing.',
        );
  }
}

/** Inji Wallet on a phone: scans the offer and the VP request. */
export class InjiMobileWalletAdapter extends HumanWalletAdapter {
  issuanceDelivery(handle: IssuanceHandle): DeliveryInstruction {
    if (!handle.offerUri)
      throw new AdapterError('offer_delivered', 'Inji Wallet needs a credential offer to scan');
    return qr(
      handle.offerUri,
      'Open Inji Wallet, tap “+” → “Scan QR code” and scan this credential offer.',
      300_000,
      handle.expiresAt,
    );
  }
}

/** Paradym (Animo's EUDI-style wallet) on a phone: scans standard offer and VP request QR codes. */
export class ParadymWalletAdapter extends HumanWalletAdapter {
  issuanceDelivery(handle: IssuanceHandle): DeliveryInstruction {
    if (!handle.offerUri)
      throw new AdapterError('offer_delivered', 'Paradym needs a credential offer to scan');
    return qr(
      handle.offerUri,
      'Open Paradym, tap the scan button and scan this credential offer.',
      300_000,
      handle.expiresAt,
    );
  }

  presentationDelivery(ctx: RunContext, handle: PresentationRequestHandle): DeliveryInstruction {
    return ctx.config.presentationFlow === 'same-device-deeplink'
      ? super.presentationDelivery(ctx, handle)
      : qr(
          handle.authorizationRequestUri,
          'Open Paradym, tap the scan button, scan this request and approve sharing.',
        );
  }
}

/** Inji Web: issuance starts inside Inji Web (authorization code through Mimoto). */
export class InjiWebWalletAdapter extends HumanWalletAdapter {
  issuanceDelivery(): DeliveryInstruction {
    return {
      kind: 'open-url',
      url: `${this.descriptor.publicUrl.replace(/\/$/, '')}/issuers`,
      hint: 'Open Inji Web, choose the Farmer issuer and download the credential. The playground binds the first matching download to this run.',
    };
  }
}

/** Headless mock wallet (apps/mock-wallet). */
export class MockWalletAdapter implements WalletAdapter {
  constructor(readonly descriptor: ImplementationDescriptor) {}

  private get base() {
    return (this.descriptor.internalUrl ?? this.descriptor.publicUrl).replace(/\/$/, '');
  }

  healthCheck() {
    return probeHealth(`${this.base}/health`);
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  issuanceDelivery(): DeliveryInstruction {
    return { kind: 'automated' };
  }

  presentationDelivery(): DeliveryInstruction {
    return { kind: 'automated' };
  }

  private async call(
    fallbackStep: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new AdapterError(
        fallbackStep,
        `Mock wallet unreachable at ${this.base}: ${(e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message}`,
      );
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = MockWalletErrorSchema.safeParse(json);
      if (!err.success)
        throw new AdapterError(fallbackStep, `Mock wallet answered HTTP ${res.status}`, res.status);
      throw new AdapterError(
        err.data.step ?? fallbackStep,
        err.data.message,
        err.data.upstreamStatus ?? res.status,
        err.data.upstreamBody,
      );
    }
    return json;
  }

  async listCredentials(signal: AbortSignal) {
    let res: Response;
    try {
      res = await fetch(`${this.base}/credentials`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new AdapterError(
        'credential_held',
        `Mock wallet unreachable at ${this.base}: ${(e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message}`,
      );
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new AdapterError(
        'credential_held',
        `Mock wallet answered HTTP ${res.status}`,
        res.status,
      );
    }
    return z.array(HeldCredentialSchema).parse(await res.json());
  }

  async acceptOffer(ctx: RunContext, handle: IssuanceHandle) {
    if (!handle.offerUri)
      throw new AdapterError(
        'offer_delivered',
        'The mock wallet only supports pre-authorized code offers',
      );
    return HeldCredentialSchema.parse(
      await this.call(
        'offer_delivered',
        '/offers/accept',
        { offerUri: handle.offerUri },
        ctx.signal,
      ),
    );
  }

  async respond(
    ctx: RunContext,
    handle: PresentationRequestHandle,
    opts: { credentialId?: string; tamper?: MockWalletTamper; replay?: RespondRequest['replay'] },
  ) {
    return RespondResponseSchema.parse(
      await this.call(
        'request_delivered',
        '/presentations/respond',
        { authorizationRequestUri: handle.authorizationRequestUri, ...opts },
        ctx.signal,
      ),
    );
  }
}
