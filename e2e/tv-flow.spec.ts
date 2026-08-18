import { test, expect } from '@playwright/test';

const PAIR_CODE_RE = /^[23456789A-HJ-NP-Z]{6}$/;
const SLIDE_TITLE_RE =
  /SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|HOT LISTINGS|TEAM NEWS/;

test('pairing code shows on tv', async ({ browser }) => {
  const tvPage = await browser.newPage();
  await tvPage.goto('/tv');
  // Unpaired TV registers itself and shows a 6-char pairing code.
  await expect(tvPage.getByText(PAIR_CODE_RE)).toBeVisible({ timeout: 20000 });
  await tvPage.close();
});

/**
 * Shared flow: sign the admin in, pair a fresh TV page, click through the
 * audio-unlock overlay and wait for the carousel. Returns both pages.
 */
async function pairTv(browser: import('@playwright/test').Browser, screenName: string) {
  // Two isolated browser contexts: one admin, one TV.
  const adminPage = await browser.newPage();
  const tvPage = await browser.newPage();

  // 1. Admin signs in.
  await adminPage.goto('/admin/login');
  await adminPage.getByLabel(/email/i).fill('admin@e2e.dev');
  await adminPage.getByLabel(/password/i).fill('e2e-password');
  await adminPage.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  // Dashboard layout nav proves the session is live.
  await expect(adminPage.getByRole('link', { name: 'Screens' })).toBeVisible({
    timeout: 15000,
  });

  // 2. TV requests a pairing code.
  await tvPage.goto('/tv');
  const codeEl = tvPage.getByText(PAIR_CODE_RE);
  await expect(codeEl).toBeVisible({ timeout: 20000 });
  const pairCode = (await codeEl.textContent())!.trim();

  // 3. Admin claims the code and names the screen.
  await adminPage.goto('/admin/screens');
  await adminPage.getByLabel(/code/i).fill(pairCode);
  await adminPage.getByLabel(/tv name/i).fill(screenName);
  await adminPage.getByRole('button', { name: 'Pair TV' }).click();
  await expect(adminPage.getByText(screenName, { exact: true })).toBeVisible({ timeout: 10000 });

  // 4. TV shows the audio-unlock overlay; click it to enter the carousel.
  const startBtn = tvPage.getByText('CLICK TO START');
  await expect(startBtn).toBeVisible({ timeout: 20000 });
  await startBtn.click();
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
    timeout: 20000,
  });

  return { adminPage, tvPage };
}

test('sale entry triggers celebration on tv', async ({ browser }) => {
  test.setTimeout(120_000); // login+pair+18s celebration leaves little room in the default 60s
  const { adminPage, tvPage } = await pairTv(browser, 'E2E TV');

  // 5. Admin records a sale from the dashboard quick-entry form.
  await adminPage.goto('/admin');
  const agentSelect = adminPage.getByLabel(/^agent/i);
  await expect(agentSelect).toBeVisible({ timeout: 10000 });
  const firstAgentId = await agentSelect
    .locator('option:not([value=""])')
    .first()
    .getAttribute('value');
  await agentSelect.selectOption(firstAgentId!);
  await adminPage.getByLabel(/^address/i).fill('E2E House 1');
  await adminPage.getByLabel(/sale price/i).fill('1000000'); // $1,000,000
  await adminPage.getByLabel(/gci/i).fill('25000'); // $25,000
  // Sale date defaults to today — leave it.
  await adminPage
    .getByRole('button', { name: /add|save|record|submit/i })
    .click();

  // 6. TV interrupts the carousel with the celebration (< 15s end-to-end).
  await expect(tvPage.getByText('SOLD!')).toBeVisible({ timeout: 15000 });
  await expect(tvPage.getByText('E2E House 1')).toBeVisible({ timeout: 5000 });

  // 7. Celebration (default 18s) finishes and the carousel resumes.
  await expect(tvPage.getByText('SOLD!')).toBeHidden({ timeout: 30000 });
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
    timeout: 10000,
  });

  await adminPage.close();
  await tvPage.close();
});

test('tv shows offline badge and keeps rotating while disconnected', async ({ browser }) => {
  test.setTimeout(220_000);
  const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 2');

  // Sever the TV's network — spec §8/§10.
  //
  // Measured empirically: Playwright/Chromium's context.setOffline(true) does NOT
  // close an already-open WebSocket (no onclose/onerror fires) and does not abort
  // in-flight ws.send() calls either — it only blocks *new* connections/fetches. The
  // existing "paired" socket keeps sending its 30s pings, but the corresponding
  // pongs never arrive, so the client never sees a close event; only the app's own
  // half-open watchdog in useTvSocket (fires once >65s have elapsed since the last
  // server message, checked once per 30s ping tick — so effectively at the 3rd tick,
  // ~90s after the socket opened, not immediately) ever flips phase to 'offline'.
  // A 30s window (immediate-onclose assumption) is therefore too tight in this test
  // environment; give it enough room for that ~90s worst case plus jitter.
  await tvPage.context().setOffline(true);
  await expect(tvPage.getByText('OFFLINE')).toBeVisible({ timeout: 110_000 });
  // Carousel keeps rotating on cached data while offline.
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible();

  // Restore the network: the socket reconnects (exponential backoff, so the
  // next attempt can be up to ~30s away) and the badge disappears.
  await tvPage.context().setOffline(false);
  await expect(tvPage.getByText('OFFLINE')).toBeHidden({ timeout: 45000 });
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible();

  await adminPage.close();
  await tvPage.close();
});

test('manual birthday broadcast shows on tv', async ({ browser }) => {
  test.setTimeout(120_000); // login+pair+18s celebration leaves little room in the default 60s
  const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 3');

  // 5. Admin fires a manual birthday broadcast from the Team page. The endpoint
  // ignores the actual birthday date, so any seeded active member works.
  await adminPage.goto('/admin/agents');
  const broadcastBtn = adminPage
    .getByRole('button', { name: 'Play birthday broadcast' })
    .first();
  await expect(broadcastBtn).toBeVisible({ timeout: 10000 });
  await broadcastBtn.click();

  // 6. TV interrupts the carousel with the birthday celebration.
  await expect(tvPage.getByText('HAPPY BIRTHDAY')).toBeVisible({ timeout: 15000 });

  // 7. Celebration (default 18s) finishes and the carousel resumes.
  await expect(tvPage.getByText('HAPPY BIRTHDAY')).toBeHidden({ timeout: 30000 });
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
    timeout: 10000,
  });

  await adminPage.close();
  await tvPage.close();
});
