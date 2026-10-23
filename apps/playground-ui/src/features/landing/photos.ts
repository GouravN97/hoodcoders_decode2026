// Images on the landing page. Most are photos from Unsplash under the free Unsplash License (no Unsplash+, no
// Getty / iStock content), each licence confirmed on the photo's own page. A few are illustrations supplied by the
// team whose source and licence have not been confirmed yet (licence: 'Unconfirmed'); confirm or replace them before
// the page is published. The files live in public/landing/; `pnpm --filter @playground/ui photos:fetch`
// (scripts/fetch-landing-photos.ts) downloads the Unsplash ones. public/landing/CREDITS.md repeats this list for
// people browsing the repo, and a test keeps the two in step.

export type LandingPhotoId = 'identity' | 'issuer' | 'wallet' | 'qr' | 'verifier' | 'security';

interface LandingImageBase {
  id: LandingPhotoId;
  /** File name in public/landing/. */
  file: string;
  /** What the image shows, for screen readers. */
  alt: string;
  /** Which idea on the page the image stands for. */
  idea: string;
  /**
   * cover (default) fills the frame and crops; contain shows the whole image on a light panel, for illustrations and
   * icons that must not be cropped.
   */
  fit?: 'cover' | 'contain';
  /** For contain: CSS background behind the image, matched to the image's own edges so it reads as one picture. */
  panel?: string;
  /** For contain: space around the image, as a percentage of the frame's width. */
  inset?: number;
}

export interface UnsplashPhoto extends LandingImageBase {
  licence: 'Unsplash License';
  licenceUrl: string;
  photographer: string;
  photographerUrl: string;
  /** Account that published the photo, when the credit on the page names someone else. */
  publishedBy?: { name: string; url: string };
  /** The photo's page on Unsplash, which states its licence. */
  sourceUrl: string;
  /** Unsplash image id, used to build the download URL. */
  imageId: string;
}

/** Supplied by the team; source and licence still to be confirmed. */
export interface UnconfirmedImage extends LandingImageBase {
  licence: 'Unconfirmed';
}

export type LandingPhoto = UnsplashPhoto | UnconfirmedImage;

export const isUnsplash = (photo: LandingPhoto): photo is UnsplashPhoto => photo.licence === 'Unsplash License';

const UNSPLASH_LICENSE = { licence: 'Unsplash License', licenceUrl: 'https://unsplash.com/license' } as const;


export const LANDING_PHOTOS: Record<LandingPhotoId, LandingPhoto> = {
  identity: {
    id: 'identity',
    file: 'identity-card-icon.jpg',
    alt: 'Icon: an ID card with a person outline and three lines of details',
    idea: 'Digital identity and ID cards',
    fit: 'contain',
    panel: '#ffffff',
    // The hero's padlock photo overlaps the top-left corner; this keeps it clear of the card outline.
    inset: 9,
    licence: 'Unconfirmed',
  },
  issuer: {
    id: 'issuer',
    file: 'issuer-illustration.jpg',
    alt: 'Illustration: an official in front of a bank-like building hands a glowing card to a family',
    idea: 'An issuer handing over a credential',
    fit: 'contain',
    panel: '#f8f9fb',
    inset: 2,
    licence: 'Unconfirmed',
  },
  wallet: {
    id: 'wallet',
    file: 'wallet-icon.png',
    alt: 'Icon: a blue wallet with a note tucked inside',
    idea: 'A wallet holding the credential',
    fit: 'contain',
    panel: '#ffffff',
    inset: 20,
    licence: 'Unconfirmed',
  },
  qr: {
    id: 'qr',
    file: 'qr-scan-illustration.png',
    alt: 'Illustration: a woman points her phone at a QR code and scans it',
    idea: 'Scanning a QR code with a phone',
    licence: 'Unconfirmed',
  },
  verifier: {
    id: 'verifier',
    file: 'verifier-id-check.png',
    alt: 'Icon: an ID card with a green tick',
    idea: 'An identity check (the verifier)',
    fit: 'contain',
    panel: '#ffffff',
    inset: 20,
    licence: 'Unconfirmed',
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
export const unsplashDownloadUrl = (photo: UnsplashPhoto) =>
  `https://images.unsplash.com/${photo.imageId}?fm=jpg&q=78&w=1800&fit=max`;
