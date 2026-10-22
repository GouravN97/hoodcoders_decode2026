import { useState } from 'react';
import { cx } from '../../components/ui';
import { landingPhotoSrc, LANDING_PHOTOS, type LandingPhotoId } from './photos';

/**
 * One landing-page photo with its Unsplash credit. If the file has not been downloaded yet
 * (`pnpm --filter @playground/ui photos:fetch`), a theme-coloured panel stands in so the layout holds.
 */
export function LandingPhoto({
  id,
  className,
  frameClassName,
  eager,
  credit = true,
}: {
  id: LandingPhotoId;
  /** Classes for the <figure> (width, placement). */
  className?: string;
  /** Classes for the frame around the image (aspect ratio, radius). */
  frameClassName?: string;
  /** Load straight away instead of when scrolled near; for photos above the fold. */
  eager?: boolean;
  credit?: boolean;
}) {
  const photo = LANDING_PHOTOS[id];
  const [missing, setMissing] = useState(false);

  return (
    <figure className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <div
        className={cx(
          'relative overflow-hidden rounded-[20px] bg-surface-2',
          'dashdark:rounded-xl dashdark:ring-1 dashdark:ring-border dashdark:shadow-[0_8px_32px_-12px_rgb(4_2_20/0.8)]',
          frameClassName,
        )}
      >
        {missing ? (
          <div
            role="img"
            aria-label={photo.alt}
            data-photo-missing={photo.file}
            className="absolute inset-0 grid place-items-center bg-gradient-to-br from-mint to-accent-soft p-4 text-center text-xs text-muted dashdark:from-accent-soft dashdark:to-surface-2"
          >
            {photo.idea}
          </div>
        ) : (
          <img
            src={landingPhotoSrc(photo)}
            alt={photo.alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setMissing(true)}
            className="absolute inset-0 size-full object-cover dashdark:brightness-[0.88] dashdark:saturate-[0.9]"
          />
        )}
      </div>
      {credit && (
        <figcaption className="truncate px-1 text-[11px] text-muted">
          Photo:{' '}
          <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:text-fg hover:decoration-current">
            {photo.photographer}
          </a>{' '}
          on Unsplash
        </figcaption>
      )}
    </figure>
  );
}
