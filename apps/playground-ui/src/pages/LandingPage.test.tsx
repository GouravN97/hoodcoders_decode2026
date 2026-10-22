import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LANDING_PHOTO_LIST, LANDING_PHOTOS } from '../features/landing/photos';
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/issuer to wallet to verifier/);
    const starts = screen.getAllByRole('link', { name: 'Start a new run' });
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const link of starts) expect(link).toHaveAttribute('href', '/');
  });

  it('walks through the three roles in order', () => {
    renderPage();
    const steps = screen.getByRole('heading', { name: 'One credential, three parties' }).closest('section')!;
    const titles = Array.from(steps.querySelectorAll('h3')).map((h) => h.textContent);
    expect(titles).toEqual(['Issues the credential', 'Holds it, then presents it', 'Checks it']);
  });

  it('shows every photo from public/landing and credits its photographer', () => {
    renderPage();
    for (const photo of LANDING_PHOTO_LIST) {
      expect(screen.getByAltText(photo.alt)).toHaveAttribute('src', `/landing/${photo.file}`);
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
  const credits = readFileSync(fileURLToPath(new URL('../../public/landing/CREDITS.md', import.meta.url)), 'utf8');

  it('uses only free Unsplash License photos', () => {
    for (const photo of LANDING_PHOTO_LIST) {
      expect(photo.licence).toBe('Unsplash License');
      expect(photo.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\//);
      expect(photo.imageId).toMatch(/^photo-/); // Unsplash+ images are premium_photo-…
    }
  });

  it('lists every photo with its file, photographer and source in CREDITS.md', () => {
    for (const photo of LANDING_PHOTO_LIST) {
      expect(credits).toContain(`\`${photo.file}\``);
      expect(credits).toContain(photo.photographer);
      expect(credits).toContain(photo.sourceUrl);
    }
    expect(credits.match(/^\| `[^`]+\.jpg` \|/gm)).toHaveLength(LANDING_PHOTO_LIST.length);
  });
});
