# Landing page image credits

Images used on the playground UI's landing page (`/welcome`, `src/pages/LandingPage.tsx`). The list lives in
`src/features/landing/photos.ts`; a test checks that this file matches it.

## Unsplash photos

From [Unsplash](https://unsplash.com), free to use under the [Unsplash License](https://unsplash.com/license):
commercial and non-commercial use and modification are allowed, credit is appreciated but not required, and the
photo may not be compiled into a competing image service. Each licence was checked on the photo's own Unsplash page
on 22 October 2026. None is Unsplash+ content, and none is from Getty Images, iStock, Adobe Stock or Alamy.

| File | Idea on the page | Photographer | Source | Licence |
| --- | --- | --- | --- | --- |
| `security-padlock.jpg` | Security and trust | [Towfiqu barbhuiya](https://unsplash.com/@towfiqu999999) | [unsplash.com/photos/…-FnA5pAzqhMM](https://unsplash.com/photos/a-golden-padlock-sitting-on-top-of-a-keyboard-FnA5pAzqhMM) | [Unsplash License](https://unsplash.com/license) |

## Not yet confirmed

Supplied by the team on 23 October 2026 without a source. Their creators and licences are unknown, so the page shows
no credit for them. Find each one's source and licence (or replace it) before the page is published anywhere public.

| File | Idea on the page | What it shows | Source | Licence |
| --- | --- | --- | --- | --- |
| `issuer-illustration.jpg` | An issuer handing over a credential | Flat illustration: an official by a bank-like building hands a card to a family | Unknown | Unknown |
| `qr-scan-illustration.png` | Scanning a QR code with a phone | Flat illustration: a woman scans a QR code with her phone | Unknown | Unknown |
| `verifier-id-check.png` | An identity check (the verifier) | Icon: an ID card with a green tick (looks like a Flaticon icon, which usually requires attribution) | Unknown | Unknown |
| `identity-card-icon.jpg` | Digital identity and ID cards | Line icon: an ID card with a person outline and three lines of details | Unknown | Unknown |
| `wallet-icon.png` | A wallet holding the credential | Icon: a blue wallet with a note tucked inside | Unknown | Unknown |

## Updating

After changing `src/features/landing/photos.ts`, update this file (the test checks they match). Unsplash photos are
downloaded with `pnpm --filter @playground/ui photos:fetch`; other images are added to this folder by hand.
