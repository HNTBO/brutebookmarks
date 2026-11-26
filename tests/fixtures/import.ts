import type { Page } from './browser';
import { ConvexClient } from 'convex/browser';

// Run in the tested page. Keep startup subscriptions on the existing fixture,
// and exercise the SDK's production mutation request and error decoding.
export function connectImportTransport() {
  const transport = new ConvexClient(location.origin, { skipConvexDeploymentUrlCheck: true });
  window.__BB_MOCK_CONVEX_CLIENT__!.mutation = transport.mutation.bind(transport);
}

export async function selectBackup(page: Page, data: unknown) {
  await page.click('#settings-btn');
  await page.click('#import-data-btn');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From File' }).click();
  await (await chooser).setFiles({ name: 'library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
