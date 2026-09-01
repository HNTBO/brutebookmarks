import { test, expect, type Page } from '@playwright/test';

async function installAuthenticatedMocks(page: Page, avatarSrc: string): Promise<void> {
  await page.addInitScript((src) => {
    localStorage.setItem('appMode', 'sync');

    const listeners: Array<(state: { user: unknown }) => void> = [];
    (window as any).__avatarMountCount = 0;
    (window as any).__emitClerkUser = () => {
      for (const listener of listeners) listener({ user: (window as any).__BB_MOCK_CLERK__.user });
    };
    (window as any).__BB_MOCK_CLERK__ = {
      user: {
        id: 'u_avatar_test',
        hasImage: true,
        primaryEmailAddress: { emailAddress: 'avatar@test.local' },
      },
      session: { getToken: async () => null },
      load: async () => {},
      addListener: (listener: (state: { user: unknown }) => void) => {
        listeners.push(listener);
        return () => {};
      },
      mountUserButton: (element: HTMLElement) => {
        (window as any).__avatarMountCount += 1;
        const button = document.createElement('button');
        button.className = 'cl-userButtonTrigger';
        const image = document.createElement('img');
        image.className = 'cl-avatarImage';
        image.src = src;
        button.appendChild(image);
        element.appendChild(button);
      },
      mountSignIn: () => {},
    };

    (window as any).__BB_MOCK_CONVEX_CLIENT__ = {
      setAuth: () => {},
      query: async () => null,
      mutation: async () => null,
      action: async () => null,
      onUpdate: () => () => {},
    };
  }, avatarSrc);
}

test('keeps the local avatar fallback when Clerk profile image fails', async ({ page }) => {
  await installAuthenticatedMocks(page, '/missing-clerk-avatar.png');
  await page.goto('/');

  const desktopAvatar = page.locator('#clerk-user-button');
  await expect(desktopAvatar.locator('.cl-avatarImage')).toHaveCount(1);
  await expect(desktopAvatar).not.toHaveClass(/avatar-image-loaded/);
  await expect(desktopAvatar.locator('.default-avatar-overlay')).toBeVisible();
});

test('shows a loaded Clerk image, restores fallback on failure, and mounts once', async ({ page }) => {
  const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="red"/%3E%3C/svg%3E';
  await installAuthenticatedMocks(page, avatar);
  await page.goto('/');

  const desktopAvatar = page.locator('#clerk-user-button');
  await expect(desktopAvatar).toHaveClass(/avatar-image-loaded/);
  await expect(desktopAvatar.locator('.default-avatar-overlay')).toBeHidden();

  await page.evaluate(() => {
    (window as any).__emitClerkUser();
    (window as any).__emitClerkUser();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__avatarMountCount)).toBe(2);

  await desktopAvatar.locator('.cl-avatarImage').evaluate((image: HTMLImageElement) => {
    image.src = '/missing-clerk-avatar-after-load.png';
  });
  await expect(desktopAvatar).not.toHaveClass(/avatar-image-loaded/);
  await expect(desktopAvatar.locator('.default-avatar-overlay')).toBeVisible();
});

test('does not duplicate the Clerk profile button when the auth module is re-evaluated', async ({ page }) => {
  const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="red"/%3E%3C/svg%3E';
  await installAuthenticatedMocks(page, avatar);
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => (window as any).__avatarMountCount)).toBe(2);

  await page.evaluate(async () => {
    const freshModuleUrl = '/src/auth/clerk.ts?profile-mount-regression';
    const freshClerkModule = await import(/* @vite-ignore */ freshModuleUrl);
    await freshClerkModule.initClerk();
  });

  await expect.poll(() => page.evaluate(() => (window as any).__avatarMountCount)).toBe(2);
  await expect(page.locator('#clerk-user-button .cl-userButtonTrigger')).toHaveCount(1);
  await expect(page.locator('#mobile-avatar-btn .cl-userButtonTrigger')).toHaveCount(1);
});

test('Use brute picture profile overrides the loaded Clerk photo and persists', async ({ page }) => {
  const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="red"/%3E%3C/svg%3E';
  await installAuthenticatedMocks(page, avatar);
  await page.goto('/');

  await page.locator('#settings-btn').click();
  const toggle = page.getByLabel('Use brute picture profile');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  const desktopAvatar = page.locator('#clerk-user-button');
  await expect(desktopAvatar).toHaveClass(/force-brute-avatar/);
  await expect(desktopAvatar.locator('.default-avatar-overlay')).toBeVisible();

  await page.reload();
  await expect(page.locator('#clerk-user-button')).toHaveClass(/force-brute-avatar/);
  await page.locator('#settings-btn').click();
  await expect(page.getByLabel('Use brute picture profile')).toBeChecked();
});
