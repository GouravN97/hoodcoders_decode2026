import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon, LayersIcon, MessagesIcon, PlayIcon, ReportIcon } from '../components/icons';
import { Badge, buttonClass, cx } from '../components/ui';
import { LandingPhoto } from '../features/landing/LandingPhoto';
import { isUnsplash, LANDING_PHOTO_LIST, type LandingPhotoId } from '../features/landing/photos';

/** The New run page (the role selector). */
const NEW_RUN = '/';

const STEPS: Array<{
  n: number;
  photo: LandingPhotoId;
  role: string;
  product: string;
  title: string;
  body: ReactNode;
  /** Protocol that carries the credential to this step. */
  arrivesBy?: string;
}> = [
  {
    n: 1,
    photo: 'issuer',
    role: 'Issuer',
    product: 'Inji Certify',
    title: 'Issues the credential',
    body: 'Sends the wallet a credential offer, exchanges a pre-authorised code for a token, then signs and returns the credential over OpenID4VCI.',
  },
  {
    n: 2,
    photo: 'wallet',
    arrivesBy: 'OpenID4VCI',
    role: 'Wallet',
    product: 'Inji Wallet or Inji Web with Mimoto',
    title: 'Holds it, then presents it',
    body: 'Stores the credential for its holder and, when a verifier asks, presents it. With SD-JWT the holder shares only the claims the request needs.',
  },
  {
    n: 3,
    photo: 'verifier',
    arrivesBy: 'OpenID4VP',
    role: 'Verifier',
    product: 'Inji Verify',
    title: 'Checks it',
    body: 'Requests a presentation over OpenID4VP, checks the signature and the validity dates, and decides: Valid, Invalid or Valid but expired.',
  },
];

/** What travels between two steps of the cycle. Decorative: each step's text names the protocol too. */
function Hop({ label }: { label: string }) {
  return (
    <li className="flex items-center justify-center py-1 lg:pb-40" aria-hidden>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted dashdark:rounded-lg dashdark:bg-surface-2">
        {label}
        <ArrowRightIcon className="rotate-90 text-accent lg:rotate-0" />
      </span>
    </li>
  );
}

function Step({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <li className="flex min-w-0 flex-col gap-4">
      <LandingPhoto id={step.photo} frameClassName="aspect-[4/3] sm:aspect-[16/9] lg:aspect-[4/3]" />
      <div className="flex flex-col gap-2 px-1">
        <p className="flex items-center gap-2.5 text-[13px] text-muted dashdark:text-xs">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg dashdark:size-6 dashdark:rounded-md dashdark:bg-gradient-to-br dashdark:from-accent dashdark:to-violet dashdark:text-white"
          >
            {step.n}
          </span>
          <span>
            <span className="sr-only">Step {step.n}: </span>
            <span className="font-medium text-fg">{step.role}</span>, {step.product}
          </span>
        </p>
        <h3 className="text-xl font-normal tracking-tight dashdark:text-base dashdark:font-semibold">{step.title}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted">{step.body}</p>
      </div>
    </li>
  );
}

const SEEN: Array<{ Icon: typeof MessagesIcon; title: string; body: string }> = [
  {
    Icon: MessagesIcon,
    title: 'Every protocol message',
    body: 'A recording proxy sits in front of each Inji service. The inspector lists every request and response, raw and decoded, with JWTs and SD-JWT disclosures opened up and secrets masked.',
  },
  {
    Icon: LayersIcon,
    title: 'Two credential formats',
    body: 'Run the same cycle with JSON-LD (ldp_vc) and SD-JWT (vc+sd-jwt) credentials, and compare how each implementation handles them.',
  },
  {
    Icon: ReportIcon,
    title: 'A pass or fail report',
    body: 'Each run ends with a report naming the issuer, wallet, verifier, format, proof type, outcome and any error. Download it as Markdown or JSON.',
  },
];

function SectionHeading({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h2 id={id} className="text-3xl font-normal leading-tight tracking-tight sm:text-4xl dashdark:text-xl dashdark:font-semibold dashdark:sm:text-2xl">
        {title}
      </h2>
      {children && <p className="text-[15px] leading-relaxed text-muted dashdark:text-sm">{children}</p>}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-6 sm:px-6 lg:gap-24 lg:px-8 lg:py-8">
      {/* Hero: Noble sets it on a mint panel like the selector's header; Dashdark keeps the indigo canvas. */}
      <section
        aria-labelledby="landing-title"
        className={cx(
          'grid items-center gap-x-12 gap-y-14 rounded-[28px] bg-mint px-6 pb-14 pt-10 sm:px-10 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:pb-16 lg:pt-14',
          'dashdark:rounded-2xl dashdark:border dashdark:border-border dashdark:bg-surface dashdark:bg-[radial-gradient(120%_90%_at_100%_0%,rgb(127_37_251/0.22),transparent_60%)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <h1
            id="landing-title"
            className="text-4xl font-normal leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem] dashdark:text-3xl dashdark:font-semibold dashdark:leading-tight dashdark:sm:text-4xl"
          >
            Watch a verifiable credential go from issuer to wallet to verifier
          </h1>
          <p className="max-w-xl text-[17px] leading-relaxed dashdark:text-[15px] dashdark:text-muted">
            The Inji Interop Playground runs the whole cycle with real Inji products: an issuer signs a credential, a wallet
            holds it, a verifier checks it. You see every message on the way, so you know exactly where two implementations
            agree and where they break.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={NEW_RUN} className={buttonClass({ variant: 'primary', size: 'lg', className: 'pl-4.5 pr-5' })}>
              <PlayIcon />
              Start a new run
            </Link>
            <a href="#how-it-works" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
              How a run works
            </a>
          </div>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Inji products in the playground">
            {['Inji Certify', 'Inji Wallet', 'Inji Web + Mimoto', 'Inji Verify'].map((p) => (
              <li key={p}>
                <Badge>{p}</Badge>
              </li>
            ))}
          </ul>
        </div>

        {/* An ID card with a padlock over its corner: identity you can trust. The padlock sits top-left so the card's credit stays visible. */}
        <div className="relative mx-auto w-full max-w-xl pl-8 pt-10 sm:pl-12 sm:pt-14 lg:max-w-none">
          <LandingPhoto id="identity" eager frameClassName="aspect-[4/3]" />
          <LandingPhoto
            id="security"
            eager
            credit={false}
            className="absolute left-0 top-0 w-[36%]"
            frameClassName="aspect-square border-[6px] border-mint dashdark:border-surface"
          />
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="flex scroll-mt-20 flex-col gap-10">
        <SectionHeading id="how-it-works" title="One credential, three parties">
          Every run follows the same path: issue, hold, present, verify. You choose who plays each part, so you can mix
          Inji products with each other or with the playground&apos;s mock services.
        </SectionHeading>
        <ol className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-5">
          {STEPS.map((step) => (
            <Fragment key={step.n}>
              {step.arrivesBy && <Hop label={step.arrivesBy} />}
              <Step step={step} />
            </Fragment>
          ))}
        </ol>
      </section>

      <section aria-labelledby="what-you-see" className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-16">
        {/* Framed at the drawing's own 617:324 shape so it fills the frame uncropped. */}
        <LandingPhoto id="qr" frameClassName="aspect-[617/324]" />
        <div className="flex flex-col gap-8">
          <SectionHeading id="what-you-see" title="Nothing happens off screen">
            A wallet scanning a QR code looks simple. Underneath it is a chain of requests, tokens and signed payloads. The
            playground records all of it.
          </SectionHeading>
          <ul className="flex flex-col gap-6">
            {SEEN.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-fg dashdark:size-9 dashdark:rounded-lg dashdark:bg-surface-2 dashdark:text-accent"
                >
                  <Icon width={18} height={18} />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[15px] font-medium dashdark:text-sm dashdark:font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>Every verification ends in one of three results:</span>
            <Badge tone="ok">Valid</Badge>
            <Badge tone="bad">Invalid</Badge>
            <Badge tone="warn">Valid but expired</Badge>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="start"
        className={cx(
          'flex flex-col items-start gap-6 rounded-[28px] bg-accent px-6 py-10 text-accent-fg sm:flex-row sm:items-center sm:justify-between sm:px-10',
          'dashdark:rounded-2xl dashdark:border dashdark:border-accent/40 dashdark:bg-surface dashdark:bg-[linear-gradient(110deg,rgb(203_60_255/0.18),rgb(127_37_251/0.08)_55%,transparent)] dashdark:text-fg',
        )}
      >
        <div className="flex max-w-xl flex-col gap-2">
          <h2 id="start" className="text-2xl font-normal tracking-tight sm:text-3xl dashdark:text-xl dashdark:font-semibold">
            Try a pairing
          </h2>
          <p className="text-[15px] leading-relaxed opacity-90 dashdark:text-sm dashdark:text-muted dashdark:opacity-100">
            Pick an issuer, a wallet and a verifier. The playground tells you whether they share a format before you run.
          </p>
        </div>
        <Link
          to={NEW_RUN}
          className={buttonClass({ variant: 'inverse', size: 'lg', className: 'shrink-0 pl-4.5 pr-5' })}
        >
          <PlayIcon />
          Start a new run
        </Link>
      </section>

      <section aria-labelledby="photo-credits" className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 id="photo-credits" className="text-[15px] font-medium dashdark:text-sm dashdark:font-semibold">
          Photo credits
        </h2>
        <p className="max-w-2xl text-[13px] text-muted">
          Unsplash photos are free to use under the{' '}
          <a href="https://unsplash.com/license" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">
            Unsplash License
          </a>
          .
        </p>
        <ul className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {LANDING_PHOTO_LIST.filter(isUnsplash).map((p) => (
            <li key={p.id} className="min-w-0">
              <span className="text-muted">{p.idea}: </span>
              <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:decoration-current">
                {p.photographer}
              </a>
              {p.publishedBy && <span className="text-muted">, published by {p.publishedBy.name}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
