// Format-specific decoded views: JWT, SD-JWT (disclosures + digest check), JSON-LD VC, form, URI.
import { useEffect, useState, type ReactNode } from 'react';
import { CodeBlock, JsonTree } from '../../components/JsonTree';
import { Badge, cx } from '../../components/ui';
import { decodedKindLabel, type Decoded, type DecodedJwt, type Embedded } from '../../lib/decode';
import { matchDisclosures, type DisclosureMatch } from '../../lib/decode/sdjwt';

function Part({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</span>
        {aside}
      </div>
      <div className="overflow-x-auto p-3">{children}</div>
    </div>
  );
}

const epochKeys = new Set(['iat', 'nbf', 'exp']);

function TimeHints({ payload }: { payload: Record<string, unknown> }) {
  const hints = Object.entries(payload).filter(([k, v]) => epochKeys.has(k) && typeof v === 'number');
  if (hints.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">
      {hints.map(([k, v]) => (
        <span key={k}>
          <span className="font-mono">{k}</span> = {new Date((v as number) * 1000).toISOString()}
        </span>
      ))}
    </p>
  );
}

export function JwtView({ jwt, title = 'JWT' }: { jwt: DecodedJwt; title?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Part title={`${title} · header`} aside={<Badge mono>{String(jwt.header.alg ?? '?')}</Badge>}>
        <JsonTree value={jwt.header} />
      </Part>
      <Part title={`${title} · payload`}>
        <JsonTree value={jwt.payload} />
        <TimeHints payload={jwt.payload} />
      </Part>
      <Part title={`${title} · signature`} aside={<span className="text-[11px] text-muted">not verified here</span>}>
        <code className="block break-all font-mono text-[11px] text-muted">{jwt.signature || '(none)'}</code>
      </Part>
    </div>
  );
}

function SdJwtView({ decoded }: { decoded: Extract<Decoded, { kind: 'sd-jwt' }> }) {
  const [matches, setMatches] = useState<DisclosureMatch[] | null>(null);
  useEffect(() => {
    let live = true;
    matchDisclosures(decoded.issuerJwt.payload, decoded.disclosures).then(
      (m) => live && setMatches(m),
      () => live && setMatches([]),
    );
    return () => {
      live = false;
    };
  }, [decoded]);

  return (
    <div className="flex flex-col gap-2">
      <JwtView jwt={decoded.issuerJwt} title="Issuer JWT" />
      <Part title={`Disclosures (${decoded.disclosures.length})`}>
        {decoded.disclosures.length === 0 ? (
          <p className="text-xs text-muted">No disclosures: nothing selectively disclosed.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Claim</th>
                <th className="py-1 pr-3 font-medium">Value</th>
                <th className="py-1 pr-3 font-medium">Salt</th>
                <th className="py-1 font-medium">Digest in _sd</th>
              </tr>
            </thead>
            <tbody>
              {decoded.disclosures.map((d, i) => {
                const m = matches?.[i];
                return (
                  <tr key={d.encoded} className="border-t border-border align-top">
                    <td className="py-1 pr-3 font-mono">{d.name ?? <span className="text-muted">[array item]</span>}</td>
                    <td className="py-1 pr-3 break-all">{typeof d.value === 'string' ? d.value : JSON.stringify(d.value)}</td>
                    <td className="py-1 pr-3 font-mono text-muted">{d.salt.slice(0, 10)}…</td>
                    <td className="py-1" title={m?.digest}>
                      {m === undefined ? (
                        <span className="text-muted">…</span>
                      ) : m.matched ? (
                        <Badge tone="ok">✓ matches</Badge>
                      ) : (
                        <Badge tone="bad">✗ not in _sd</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Part>
      {decoded.kbJwt ? (
        <JwtView jwt={decoded.kbJwt} title="Key-binding JWT" />
      ) : (
        <p className="text-xs text-muted">No key-binding JWT (expected on issuance, required on presentation).</p>
      )}
    </div>
  );
}

function EmbeddedList({ embedded }: { embedded: Embedded[] }) {
  if (embedded.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {embedded.map((e) => (
        <div key={e.path} className="flex flex-col gap-2">
          <p className="text-xs">
            <span className="font-mono font-semibold">{e.path}</span>{' '}
            <span className="text-muted">decoded as {decodedKindLabel(e.decoded)}</span>
          </p>
          <div className="border-l-2 border-accent/40 pl-3">
            <DecodedView decoded={e.decoded} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ParamsTable({ params }: { params: Record<string, string> }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {Object.entries(params).map(([k, v]) => (
          <tr key={k} className="border-t border-border first:border-t-0 align-top">
            <td className="py-1 pr-3 font-mono font-semibold whitespace-nowrap">{k}</td>
            <td className="py-1 font-mono break-all text-muted">{v.length > 240 ? `${v.slice(0, 240)}…` : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LdpProof({ value }: { value: Record<string, unknown> }) {
  const proofs = Array.isArray(value.proof) ? value.proof : [value.proof];
  return (
    <Part title="Proof" aside={<span className="text-[11px] text-muted">not verified here</span>}>
      {proofs.map((p, i) => {
        const proof = (p ?? {}) as Record<string, unknown>;
        return (
          <dl key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs">
            {Object.entries(proof).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-muted">{k}</dt>
                <dd className={cx('break-all', k === 'type' && 'font-semibold')}>{String(v)}</dd>
              </div>
            ))}
          </dl>
        );
      })}
    </Part>
  );
}

export function DecodedView({ decoded }: { decoded: Decoded }) {
  switch (decoded.kind) {
    case 'empty':
      return <p className="text-xs text-muted">Empty body.</p>;
    case 'text':
      return <CodeBlock>{decoded.value}</CodeBlock>;
    case 'jwt':
      return <JwtView jwt={decoded.jwt} />;
    case 'sd-jwt':
      return <SdJwtView decoded={decoded} />;
    case 'json': {
      const value = decoded.value as Record<string, unknown>;
      return (
        <div className="flex flex-col gap-2">
          {decoded.isLdpVc && (
            <p className="text-xs">
              <Badge tone="accent">JSON-LD</Badge>{' '}
              <span className="text-muted">{Array.isArray(value.type) ? value.type.join(', ') : String(value.type)}</span>
            </p>
          )}
          <Part title={decoded.isLdpVc ? 'Document' : 'JSON'}>
            <JsonTree value={decoded.value} openDepth={decoded.isLdpVc ? 2 : 3} />
          </Part>
          {decoded.isLdpVc && <LdpProof value={value} />}
          <EmbeddedList embedded={decoded.embedded} />
        </div>
      );
    }
    case 'form':
      return (
        <div className="flex flex-col gap-2">
          <Part title="Form fields">
            <ParamsTable params={decoded.fields} />
          </Part>
          <EmbeddedList embedded={decoded.embedded} />
        </div>
      );
    case 'uri':
      return (
        <div className="flex flex-col gap-2">
          <Part title={`${decoded.scheme}:// parameters`}>
            <ParamsTable params={decoded.params} />
          </Part>
          <EmbeddedList embedded={decoded.embedded} />
        </div>
      );
  }
}
