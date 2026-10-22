# Landing page photo credits

Photos used on the playground UI's landing page (`/welcome`, `src/pages/LandingPage.tsx`). All six are from
[Unsplash](https://unsplash.com) and free to use under the [Unsplash License](https://unsplash.com/license): commercial
and non-commercial use and modification are allowed, credit is appreciated but not required, and the photos may not be
compiled into a competing image service.

Each licence was checked on the photo's own Unsplash page on 22 October 2026. None of them is Unsplash+ content, and none
is from Getty Images, iStock, Adobe Stock or Alamy.

| File | Idea on the page | Photographer | Source | Licence |
| --- | --- | --- | --- | --- |
| `identity-card.jpg` | Digital identity and ID cards | Henry Thong ([YouTube](https://www.youtube.com/henrythong)), published by [Kit (formerly ConvertKit)](https://unsplash.com/@kit) | [unsplash.com/photos/…-QMU1z6ReS5A](https://unsplash.com/photos/white-and-blue-identification-card-QMU1z6ReS5A) | [Unsplash License](https://unsplash.com/license) |
| `issuer-signing.jpg` | A document being signed (the issuer) | [Jakub Żerdzicki](https://unsplash.com/@jakubzerdzicki) | [unsplash.com/photos/…-QI6NLgN5XnM](https://unsplash.com/photos/man-signing-a-document-with-a-pen-QI6NLgN5XnM) | [Unsplash License](https://unsplash.com/license) |
| `wallet-phone.jpg` | A phone used as a digital wallet | [Airalo](https://unsplash.com/@airalo) | [unsplash.com/photos/…-i_MFw9yRmLU](https://unsplash.com/photos/hand-holding-a-smartphone-displaying-a-payment-app-i_MFw9yRmLU) | [Unsplash License](https://unsplash.com/license) |
| `qr-scan.jpg` | Scanning a QR code with a phone | [Marielle Ursua](https://unsplash.com/@heyimmarielle_03) | [unsplash.com/photos/…-OO39PfTUhJ0](https://unsplash.com/photos/a-person-holding-a-cell-phone-in-front-of-a-laptop-OO39PfTUhJ0) | [Unsplash License](https://unsplash.com/license) |
| `verifier-passport-control.jpg` | An identity check (the verifier) | [Daniel Schludi](https://unsplash.com/@schluditsch) | [unsplash.com/photos/…-e1RI3wRelqM](https://unsplash.com/photos/passkontrolle-passport-control-signage-e1RI3wRelqM) | [Unsplash License](https://unsplash.com/license) |
| `security-padlock.jpg` | Security and trust | [Towfiqu barbhuiya](https://unsplash.com/@towfiqu999999) | [unsplash.com/photos/…-FnA5pAzqhMM](https://unsplash.com/photos/a-golden-padlock-sitting-on-top-of-a-keyboard-FnA5pAzqhMM) | [Unsplash License](https://unsplash.com/license) |

The ID card photo's Unsplash page asks for credit to Henry Thong; it was uploaded by the Kit account, so both are named.

## Updating

The list lives in `src/features/landing/photos.ts`. After changing it, update this table (a test checks they match) and
run `pnpm --filter @playground/ui photos:fetch` to download the files into this folder.
