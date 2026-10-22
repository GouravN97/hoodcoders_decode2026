// Photos on the landing page. Every one is from Unsplash under the free Unsplash License (no Unsplash+, no
// Getty / iStock content), and each licence was confirmed on the photo's own page. The files live in
// public/landing/ and are downloaded by `pnpm --filter @playground/ui photos:fetch` (scripts/fetch-landing-photos.ts),
// which reads this list. public/landing/CREDITS.md repeats it for people browsing the repo; a test keeps the two in step.

export type LandingPhotoId = 'identity' | 'issuer' | 'wallet' | 'qr' | 'verifier' | 'security';

export interface LandingPhoto {
  id: LandingPhotoId;
  /** File name in public/landing/. */
  file: string;
  /** What the photo shows, for screen readers. */
  alt: string;
  /** Which idea on the page the photo stands for. */
  idea: string;
  photographer: string;
  photographerUrl: string;
  /** Account that published the photo, when the credit on the page names someone else. */
  publishedBy?: { name: string; url: string };
  /** The photo's page on Unsplash, which states its licence. */
  sourceUrl: string;
  /** Unsplash image id, used to build the download URL. */
  imageId: string;
  licence: 'Unsplash License';
  licenceUrl: string;
}

const UNSPLASH_LICENSE = { licence: 'Unsplash License', licenceUrl: 'https://unsplash.com/license' } as const;

export const LANDING_PHOTOS: Record<LandingPhotoId, LandingPhoto> = {
  identity: {
    id: 'identity',
    file: 'identity-card.jpg',
    alt: 'A white and blue identification card',
    idea: 'Digital identity and ID cards',
    photographer: 'Henry Thong',
    photographerUrl: 'https://www.youtube.com/henrythong',
    publishedBy: { name: 'Kit (formerly ConvertKit)', url: 'https://unsplash.com/@kit' },
    sourceUrl: 'https://unsplash.com/photos/white-and-blue-identification-card-QMU1z6ReS5A',
    imageId: 'photo-1581553672347-95d9444c0d2c',
    ...UNSPLASH_LICENSE,
  },
  issuer: {
    id: 'issuer',
    file: 'issuer-signing.jpg',
    alt: 'Close-up of hands signing a printed agreement with a pen',
    idea: 'A document being signed (the issuer)',
    photographer: 'Jakub Żerdzicki',
    photographerUrl: 'https://unsplash.com/@jakubzerdzicki',
    sourceUrl: 'https://unsplash.com/photos/man-signing-a-document-with-a-pen-QI6NLgN5XnM',
    imageId: 'photo-1763729805496-b5dbf7f00c79',
    ...UNSPLASH_LICENSE,
  },
  wallet: {
    id: 'wallet',
    file: 'wallet-phone.jpg',
    alt: 'A hand holding a smartphone with a payment app open',
    idea: 'A phone used as a digital wallet',
    photographer: 'Airalo',
    photographerUrl: 'https://unsplash.com/@airalo',
    sourceUrl: 'https://unsplash.com/photos/hand-holding-a-smartphone-displaying-a-payment-app-i_MFw9yRmLU',
    imageId: 'photo-1760531941882-433a8a7c5fd4',
    ...UNSPLASH_LICENSE,
  },
  qr: {
    id: 'qr',
    file: 'qr-scan.jpg',
    alt: 'A person holding up a phone to scan a QR code in front of a laptop',
    idea: 'Scanning a QR code with a phone',
    photographer: 'Marielle Ursua',
    photographerUrl: 'https://unsplash.com/@heyimmarielle_03',
    sourceUrl: 'https://unsplash.com/photos/a-person-holding-a-cell-phone-in-front-of-a-laptop-OO39PfTUhJ0',
    imageId: 'photo-1706759755851-6163305080f0',
    ...UNSPLASH_LICENSE,
  },
  verifier: {
    id: 'verifier',
    file: 'verifier-passport-control.jpg',
    alt: 'A Passkontrolle / Passport control sign at a European border check',
    idea: 'An identity check (the verifier)',
    photographer: 'Daniel Schludi',
    photographerUrl: 'https://unsplash.com/@schluditsch',
    sourceUrl: 'https://unsplash.com/photos/passkontrolle-passport-control-signage-e1RI3wRelqM',
    imageId: 'photo-1563463149242-bd378d9ab05c',
    ...UNSPLASH_LICENSE,
  },
  security: {
    id: 'security',
    file: 'security-padlock.jpg',
    alt: 'A golden padlock resting on a computer keyboard',
    idea: 'Security and trust',
    photographer: 'Towfiqu barbhuiya',
    photographerUrl: 'https://unsplash.com/@towfiqu999999',
    sourceUrl: 'https://unsplash.com/photos/a-golden-padlock-sitting-on-top-of-a-keyboard-FnA5pAzqhMM',
    imageId: 'photo-1633265486064-086b219458ec',
    ...UNSPLASH_LICENSE,
  },
};

export const LANDING_PHOTO_LIST = Object.values(LANDING_PHOTOS);

/** Where the page loads a photo from (Vite serves public/ at the base URL). */
export const landingPhotoSrc = (photo: LandingPhoto) => `${import.meta.env.BASE_URL}landing/${photo.file}`;

/** Unsplash CDN URL the fetch script downloads: a 1800px-wide JPEG, about 250–400 KB. */
export const unsplashDownloadUrl = (photo: LandingPhoto) =>
  `https://images.unsplash.com/${photo.imageId}?fm=jpg&q=78&w=1800&fit=max`;
