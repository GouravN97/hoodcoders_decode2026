import type { DeliveryInstruction, DeliveryPurpose } from '@playground/shared';
import { api } from '../../api/client';
import { CodeBlock } from '../../components/JsonTree';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ExternalIcon } from '../../components/icons';
import { buttonClass, Card, CopyButton, SectionTitle } from '../../components/ui';

const TITLE: Record<DeliveryPurpose, Record<DeliveryInstruction['kind'], string>> = {
  issuance: {
    qr: 'Scan to receive the credential',
    deeplink: 'Open the link to receive the credential',
    'open-url': 'Collect the credential in the wallet',
    automated: 'Wallet is collecting the credential',
    'dc-api': 'Ask the browser for the credential',
  },
  presentation: {
    qr: 'Scan to share the credential',
    deeplink: 'Open the link to share the credential',
    'open-url': 'Share the credential from the wallet',
    automated: 'Wallet is presenting the credential',
    'dc-api': "Share the credential from this browser's wallet",
  },
};

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return <span className={left < 30 ? 'text-warn' : undefined}>{left === 0 ? 'Expired' : `Expires in ${label}`}</span>;
}

/** A phone-sized or touch-first screen: the wallet is probably on this device, so a link beats a QR code. */
const SAME_DEVICE_QUERY = '(max-width: 640px), (pointer: coarse)';
function useSameDeviceScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(SAME_DEVICE_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(SAME_DEVICE_QUERY).matches,
    () => false,
  );
}

/** Wallet links Inji Wallet registers (its AndroidManifest has intent filters for both schemes). */
const isWalletLink = (payload: string) => /^(openid4vp|openid-credential-offer):\/\//i.test(payload);

/** The Digital Credentials API: navigator.credentials.get with `digital` requests, and DigitalCredential. */
const hasDigitalCredentials = () =>
  typeof navigator !== 'undefined' && 'credentials' in navigator && 'DigitalCredential' in globalThis;

type DcApiState = { status: 'idle' | 'asking' | 'sent' } | { status: 'failed'; message: string };

/** Asks the browser's wallet on a click (the API needs a user gesture) and posts what it returns. */
function DcApiRequest({ runId, instruction }: { runId: string; instruction: Extract<DeliveryInstruction, { kind: 'dc-api' }> }) {
  const [state, setState] = useState<DcApiState>({ status: 'idle' });
  const supported = hasDigitalCredentials();
  const ask = async () => {
    setState({ status: 'asking' });
    const context = { origin: location.origin, userAgent: navigator.userAgent };
    try {
      const credential = (await navigator.credentials.get({
        digital: { requests: [{ protocol: instruction.protocol, data: instruction.request }] },
      } as CredentialRequestOptions)) as unknown as { protocol?: string; data?: unknown } | null;
      if (!credential) throw Object.assign(new Error('The browser returned no credential'), { name: 'NotFoundError' });
      // Older Chrome builds return the response as a JSON string.
      const data = typeof credential.data === 'string' ? (JSON.parse(credential.data) as unknown) : credential.data;
      await api.dcApiResponse(runId, { ...context, ...(credential.protocol ? { protocol: credential.protocol } : {}), data });
      setState({ status: 'sent' });
    } catch (e) {
      const err = e as Error;
      setState({ status: 'failed', message: `${err.name}: ${err.message}` });
      await api.dcApiResponse(runId, { ...context, error: { name: err.name || 'Error', message: err.message } }).catch(() => {});
    }
  };
  return (
    <>
      {supported ? (
        <>
          <p className="text-center text-[13px]">{instruction.hint}</p>
          <button
            type="button"
            className={buttonClass({ variant: 'primary' })}
            disabled={state.status === 'asking' || state.status === 'sent'}
            onClick={() => void ask()}
          >
            {state.status === 'asking' ? 'Waiting for the browser…' : 'Request with browser wallet'}
          </button>
          {state.status === 'sent' && <p className="text-xs text-muted">Sent to the verifier.</p>}
          {state.status === 'failed' && <p className="text-xs text-bad">{state.message}</p>}
        </>
      ) : (
        <p className="text-center text-[13px] text-muted" data-testid="dc-api-unsupported">
          This browser does not offer the Digital Credentials API (navigator.credentials.get with a digital request), so
          there is no wallet here to ask. Chrome on Android with a wallet that registers as a credential provider does.
        </p>
      )}
      <details className="w-full">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">Request ({instruction.protocol})</summary>
        <CodeBlock>{JSON.stringify(instruction.request, null, 2)}</CodeBlock>
      </details>
    </>
  );
}

export function DeliveryPanel({
  runId,
  purpose,
  instruction,
}: {
  runId: string;
  purpose: DeliveryPurpose;
  instruction: DeliveryInstruction;
}) {
  const sameDevice = useSameDeviceScreen();
  const [showQr, setShowQr] = useState(false);
  const linkFirst = instruction.kind === 'qr' && sameDevice && isWalletLink(instruction.payload);
  return (
    <Card aria-label="Delivery">
      <SectionTitle>{linkFirst ? TITLE[purpose].deeplink : TITLE[purpose][instruction.kind]}</SectionTitle>
      <div className="flex flex-col items-center gap-3 p-4">
        {instruction.kind === 'qr' && linkFirst && (
          <>
            <p className="text-center text-[13px]">The wallet on this device opens the link directly.</p>
            <a href={instruction.payload} className={buttonClass({ variant: 'primary', className: 'pr-3' })} data-testid="open-in-wallet">
              Open in wallet <ExternalIcon />
            </a>
            <button
              type="button"
              className="text-xs text-muted underline underline-offset-2 hover:text-fg"
              aria-expanded={showQr}
              onClick={() => setShowQr((v) => !v)}
            >
              {showQr ? 'Hide QR code' : 'Show QR code instead'}
            </button>
          </>
        )}
        {instruction.kind === 'qr' && (!linkFirst || showQr) && (
          <>
            {/* QR codes need a light background to scan, whatever the theme. */}
            <div className="rounded-lg bg-white p-3" data-testid="delivery-qr">
              <QRCodeSVG value={instruction.payload} size={216} level="L" marginSize={0} title={TITLE[purpose].qr} />
            </div>
            <p className="text-center text-[13px]">{instruction.hint}</p>
            <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="font-mono">
                {instruction.bytes} bytes · QR v{instruction.qrVersion}
              </span>
              {instruction.expiresAt && <Countdown until={instruction.expiresAt} />}
              <CopyButton text={instruction.payload} label="Copy payload" />
            </div>
          </>
        )}
        {(instruction.kind === 'deeplink' || instruction.kind === 'open-url') && (
          <>
            <p className="text-center text-[13px]">{instruction.hint}</p>
            <a
              href={instruction.url}
              target={instruction.kind === 'open-url' ? '_blank' : undefined}
              rel="noreferrer"
              className={buttonClass({ variant: 'primary', className: 'pr-3' })}
            >
              {instruction.kind === 'deeplink' ? 'Open in wallet' : 'Open wallet'} <ExternalIcon />
            </a>
            <code className="w-full break-all rounded-md bg-code px-2 py-1 font-mono text-[11px] text-muted">{instruction.url}</code>
          </>
        )}
        {instruction.kind === 'dc-api' && <DcApiRequest runId={runId} instruction={instruction} />}
        {instruction.kind === 'automated' && (
          <p className="text-center text-[13px] text-muted">
            This wallet runs without a person; the playground drives it directly and watches the messages.
          </p>
        )}
      </div>
    </Card>
  );
}
