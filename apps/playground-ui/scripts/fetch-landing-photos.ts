// Downloads the landing-page photos from Unsplash into public/landing/.
//
//   pnpm --filter @playground/ui photos:fetch            # fetch the ones that are missing
//   pnpm --filter @playground/ui photos:fetch --force    # fetch all of them again
//
// The list, credits and licences live in src/features/landing/photos.ts. Commit the downloaded files.
// Behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+) so fetch uses HTTPS_PROXY.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUnsplash, LANDING_PHOTO_LIST, unsplashDownloadUrl } from '../src/features/landing/photos';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'landing');
const force = process.argv.includes('--force');

mkdirSync(outDir, { recursive: true });

let failed = 0;
// Only the Unsplash photos; the other images were added to public/landing/ by hand.
for (const photo of LANDING_PHOTO_LIST.filter(isUnsplash)) {
  const target = join(outDir, photo.file);
  if (existsSync(target) && !force) {
    console.log(`skip   ${photo.file} (already there)`);
    continue;
  }
  const url = unsplashDownloadUrl(photo);
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(target, bytes);
    console.log(`saved  ${photo.file} (${Math.round(bytes.length / 1024)} KB) by ${photo.photographer}`);
  } catch (err) {
    failed++;
    console.error(`FAILED ${photo.file} from ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} photo(s) not downloaded. The page shows a placeholder panel for each until they are.`);
  process.exit(1);
}
