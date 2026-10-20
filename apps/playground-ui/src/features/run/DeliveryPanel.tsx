import type { DeliveryInstruction, DeliveryPurpose } from '@playground/shared';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { ExternalIcon } from '../../components/icons';
import { buttonClass, Card, CopyButton, SectionTitle } from '../../components/ui';

const TITLE: Record<DeliveryPurpose, Record<DeliveryInstruction['kind'], string>> = {
  issuance: {
    qr: 'Scan to receive the credential',
    deeplink: 'Open the link to receive the credential',
    'open-url': 'Collect the credential in the wallet',
    automated: 'Wallet is collecting the credential',
  },
  presentation: {
    qr: 'Scan to share the credential',
    deeplink: 'Open the link to share the credential',
    'open-url': 'Share the credential from the wallet',
    automated: 'Wallet is presenting the credential',
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

export function DeliveryPanel({ purpose, instruction }: { purpose: DeliveryPurpose; instruction: DeliveryInstruction }) {
  return (
    <Card aria-label="Delivery">
      <SectionTitle>{TITLE[purpose][instruction.kind]}</SectionTitle>
      <div className="flex flex-col items-center gap-3 p-4">
        {instruction.kind === 'qr' && (
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
        {instruction.kind === 'automated' && (
          <p className="text-center text-[13px] text-muted">
            This wallet runs without a person; the playground drives it directly and watches the messages.
          </p>
        )}
      </div>
    </Card>
  );
}
