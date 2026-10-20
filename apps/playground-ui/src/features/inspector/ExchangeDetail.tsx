import { protocolStepLabel, type ExchangeWithDecoded, type HttpMessage } from '@playground/shared';
import { useMemo, useState } from 'react';
import { ArrowRightIcon } from '../../components/icons';
import { CodeBlock } from '../../components/JsonTree';
import { Badge, CopyButton, EmptyState, Tabs } from '../../components/ui';
import { decodeBody, decodeUrlQuery, type Decoded } from '../../lib/decode';
import { redactHeaders, redactText } from '../../lib/redact';
import { DecodedView } from './DecodedView';
import { partyLabel } from './messages';

type Side = 'request' | 'response';
type View = 'decoded' | 'raw' | 'headers';

export function ExchangeDetail({ exchange, reveal }: { exchange: ExchangeWithDecoded; reveal: boolean }) {
  const hasResponse = !exchange.outOfBand && exchange.response !== undefined;
  const [side, setSide] = useState<Side>(hasResponse && !exchange.request.body ? 'response' : 'request');
  const [view, setView] = useState<View>('decoded');
  const activeSide: Side = side === 'response' && !hasResponse ? 'request' : side;

  const message: HttpMessage | undefined = activeSide === 'request' ? exchange.request : exchange.response;
  const body = reveal ? message?.body : redactText(message?.body);
  const headers = message ? (reveal ? message.headers : redactHeaders(message.headers)) : {};

  const decoded: Decoded = useMemo(() => decodeBody(body, message?.contentType), [body, message?.contentType]);
  const urlQuery = useMemo(
    () => (activeSide === 'request' && !exchange.outOfBand ? decodeUrlQuery(reveal ? exchange.url : (redactText(exchange.url) ?? '')) : null),
    [activeSide, exchange.outOfBand, exchange.url, reveal],
  );

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{partyLabel(exchange.from)}</span>
          <ArrowRightIcon width={12} height={12} strokeWidth={1.5} />
          <span>{partyLabel(exchange.component)}</span>
          <span>·</span>
          <span>{new Date(exchange.ts).toLocaleString(undefined, { hour12: false })}</span>
          {exchange.latencyMs !== undefined && !exchange.outOfBand && <span>· {exchange.latencyMs} ms</span>}
          <Badge>{protocolStepLabel(exchange.step)}</Badge>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <span className="font-mono text-sm font-semibold">{exchange.outOfBand ? 'OOB' : exchange.method}</span>
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">
            {reveal ? exchange.url : redactText(exchange.url)}
          </code>
          {exchange.status !== undefined && (
            <Badge tone={exchange.status >= 400 ? 'bad' : 'ok'} mono>
              {exchange.status}
            </Badge>
          )}
        </div>
        {exchange.outOfBand && (
          <p className="text-xs text-muted">
            Out-of-band: delivered to the wallet as a QR code or link and recorded by the playground. There is no HTTP
            response.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <Tabs
          label="Request or response"
          size="sm"
          value={activeSide}
          onChange={setSide}
          items={[
            { id: 'request', label: exchange.outOfBand ? 'Payload' : 'Request' },
            ...(hasResponse ? [{ id: 'response' as const, label: 'Response' }] : []),
          ]}
        />
        <Tabs
          label="View"
          value={view}
          onChange={setView}
          items={[
            { id: 'decoded', label: 'Decoded' },
            { id: 'raw', label: 'Raw' },
            { id: 'headers', label: 'Headers' },
          ]}
        />
      </div>

      <div className="min-w-0 p-4" role="tabpanel" aria-label={`${activeSide} ${view}`}>
        {view === 'decoded' && (
          <div className="flex flex-col gap-3">
            {urlQuery && Object.keys(urlQuery.fields).length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">URL query</p>
                <DecodedView decoded={urlQuery} />
              </div>
            )}
            <DecodedView decoded={decoded} />
          </div>
        )}
        {view === 'raw' &&
          (body ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  {message?.contentType ?? 'no content-type'} · {new TextEncoder().encode(body).length} bytes
                  {!reveal && ' · secrets masked'}
                </span>
                <CopyButton text={body} />
              </div>
              <CodeBlock>{body}</CodeBlock>
            </div>
          ) : (
            <EmptyState title="No body" />
          ))}
        {view === 'headers' &&
          (Object.keys(headers).length === 0 ? (
            <EmptyState title="No headers" />
          ) : (
            <table className="w-full text-left text-xs">
              <tbody>
                {Object.entries(headers).map(([k, v]) => (
                  <tr key={k} className="border-t border-border first:border-t-0 align-top">
                    <td className="py-1 pr-3 font-mono font-semibold whitespace-nowrap">{k}</td>
                    <td className="py-1 font-mono break-all text-muted">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
