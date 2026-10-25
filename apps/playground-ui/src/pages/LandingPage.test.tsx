import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { isUnsplash, LANDING_PHOTO_LIST, LANDING_PHOTOS } from '../features/landing/photos';
import { LandingPage } from './LandingPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/welcome']}>
      <LandingPage />
    </MemoryRouter>,
  );

describe('LandingPage', () => {
  it('introduces the playground and links to the New run page', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /issuer to wallet to verifier/,
    );
    const starts = screen.getAllByRole('link', { name: 'Start a new run' });
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const link of starts) expect(link).toHaveAttribute('href', '/');
  });

  it('walks through the three roles in order', () => {
    renderPage();
    const steps = screen
      .getByRole('heading', { name: 'One credential, three parties' })
      .closest('section')!;
    const titles = Array.from(steps.querySelectorAll('h3')).map((h) => h.textContent);
    expect(titles).toEqual(['Issues the credential', 'Holds it, then presents it', 'Checks it']);
  });

  it('shows every image from public/landing and credits each Unsplash photographer', () => {
    renderPage();
    for (const photo of LANDING_PHOTO_LIST) {
      expect(screen.getByAltText(photo.alt)).toHaveAttribute('src', `/landing/${photo.file}`);
      if (!isUnsplash(photo)) continue;
      const credits = screen.getAllByRole('link', { name: photo.photographer });
      expect(credits.every((a) => a.getAttribute('href') === photo.sourceUrl)).toBe(true);
    }
  });

  it('stands in a labelled panel for a photo that has not been downloaded', () => {
    renderPage();
    const { alt, file } = LANDING_PHOTOS.qr;
    fireEvent.error(screen.getByAltText(alt));
    expect(screen.getByRole('img', { name: alt })).toHaveAttribute('data-photo-missing', file);
  });
});

describe('landing photo credits', () => {
  const credits = readFileSync(resolve('public/landing/CREDITS.md'), 'utf8');

  it('takes Unsplash photos only from the free licence', () => {
    for (const photo of LANDING_PHOTO_LIST.filter(isUnsplash)) {
      expect(photo.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\//);
      expect(photo.imageId).toMatch(/^photo-/); // Unsplash+ images are premium_photo-…
    }
  });

  it('lists every image with its file in CREDITS.md, with photographer and source for Unsplash ones', () => {
    for (const photo of LANDING_PHOTO_LIST) {
      expect(credits).toContain(`\`${photo.file}\``);
      if (!isUnsplash(photo)) continue;
      expect(credits).toContain(photo.photographer);
      expect(credits).toContain(photo.sourceUrl);
    }
    expect(credits.match(/^\| `[^`]+\.(jpg|png)` \|/gm)).toHaveLength(LANDING_PHOTO_LIST.length);
  });

  it('flags in CREDITS.md every image whose licence is not confirmed', () => {
    const unconfirmed = LANDING_PHOTO_LIST.filter((p) => !isUnsplash(p));
    const section = credits.slice(credits.indexOf('## Not yet confirmed'));
    expect(section.length).toBeLessThan(credits.length);
    for (const photo of unconfirmed) expect(section).toContain(`\`${photo.file}\``);
  });
});
