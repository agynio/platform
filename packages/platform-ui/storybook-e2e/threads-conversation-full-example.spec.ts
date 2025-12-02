import { test, expect } from '@playwright/test';

const crashSignatures = [
  "Cannot read properties of undefined (reading 'index')",
  "reading 'index'",
];

const allowedWarningPatterns = [/zero[-\s]sized element/i, /user aborted a request/i];

test.describe('Storybook Threads Conversation Full example', () => {
  test('avoids loader flicker and stray scroll writes on cached restore', async ({ page }) => {
    await page.addInitScript(() => {
      const scrollCalls: { target: 'window' | 'element'; args: unknown[] }[] = [];
      (window as unknown as { __scrollCalls__: typeof scrollCalls }).__scrollCalls__ = scrollCalls;

      const record = (target: unknown, key: string, flag: 'window' | 'element') => {
        const typedTarget = target as Record<string, (...args: unknown[]) => unknown>;
        const original = typedTarget[key];
        if (typeof original !== 'function') {
          return;
        }
        typedTarget[key] = function patchedScrollTo(this: unknown, ...args: unknown[]) {
          scrollCalls.push({ target: flag, args });
          return original.apply(this, args);
        };
      };

      if (typeof window.scrollTo === 'function') {
        record(window, 'scrollTo', 'window');
      }

      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
      if (descriptor?.value) {
        const original = descriptor.value as (...args: unknown[]) => unknown;
        Object.defineProperty(Element.prototype, 'scrollTo', {
          configurable: true,
          writable: true,
          value(this: Element, ...args: unknown[]) {
            scrollCalls.push({ target: 'element', args });
            return original.apply(this, args);
          },
        });
      } else {
        record(Element.prototype, 'scrollTo', 'element');
      }
    });

    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      consoleErrors.push(message);
      console.log('[pageerror]', message);
    });

    page.on('console', async (message) => {
      if (message.type() !== 'error') {
        return;
      }
      let text = message.text();
      try {
        const args = await Promise.all(
          message.args().map(async (arg) => {
            try {
              return await arg.jsonValue();
            } catch (_error) {
              return String(arg);
            }
          }),
        );
        if (args.length > 0) {
          text = `${text} ${JSON.stringify(args)}`;
        }
      } catch (_error) {
        // ignore argument introspection errors
      }
      consoleErrors.push(text);
      console.log('[console.error]', text);
    });

    await page.goto('/iframe?id=screens-threads--populated&viewMode=story&debug=1');

    const getActiveConversationLocator = () =>
      page.locator('[data-testid^="conversation-host-item-"][aria-hidden="false"] [data-testid="conversation"]');

    const getConversationHeight = async () => {
      const locator = getActiveConversationLocator();
      await expect(locator).toHaveCount(1);
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      if (!box) {
        throw new Error('Active conversation not visible');
      }
      return box.height;
    };

    const getScrollCallCount = async () =>
      await page.evaluate(() => ((window as unknown as { __scrollCalls__?: unknown[] }).__scrollCalls__?.length ?? 0));

    const getActiveScrollTop = async (): Promise<number | null> =>
      await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>('[data-testid^="conversation-host-item-"][aria-hidden="false"]');
        if (!host) return null;
        const pickScroller = (root: HTMLElement): HTMLElement | null => {
          const explicit = root.querySelector<HTMLElement>('[data-viewport-type="element"]');
          if (explicit) return explicit;
          const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'));
          return (
            candidates.find((el) => {
              const style = window.getComputedStyle(el);
              return /(auto|scroll)/i.test(style.overflowY);
            }) ?? null
          );
        };
        const scroller = pickScroller(host);
        return scroller ? Math.round(scroller.scrollTop) : null;
      });

    const threadsList = page.locator('[data-testid="threads-list"]');
    await expect(threadsList).toBeVisible();

    const initialHeight = await getConversationHeight();
    await getScrollCallCount();
    const initialScrollTop = await getActiveScrollTop();

    await threadsList.getByText('DB Agent', { exact: true }).click();
    await expect(page.locator('[data-testid="conversation-host-item-2"]')).toHaveAttribute('aria-hidden', 'false');
    await page.waitForTimeout(50);

    const scrollCallsAfterSwitch = await getScrollCallCount();

    await threadsList.getByText('Auth Agent', { exact: true }).click();
    const activeHost = page.locator('[data-testid="conversation-host-item-1"]');
    await expect(activeHost).toHaveAttribute('aria-hidden', 'false');
    await page.waitForTimeout(50);

    const loader = activeHost.locator('[data-testid="conversation-loader"]');
    await expect(loader).toHaveCount(0);

    const restoredHeight = await getConversationHeight();
    expect(Math.abs(restoredHeight - initialHeight)).toBeLessThanOrEqual(1);

    const scrollCallsAfterRestore = await getScrollCallCount();
    const restoreCallDelta = scrollCallsAfterRestore - scrollCallsAfterSwitch;
    expect(restoreCallDelta).toBeGreaterThanOrEqual(1);
    expect(restoreCallDelta).toBeLessThanOrEqual(3);

    const scrollTopAfterRestore = await getActiveScrollTop();
    if (initialScrollTop !== null && scrollTopAfterRestore !== null) {
      expect(Math.abs(scrollTopAfterRestore - initialScrollTop)).toBeLessThanOrEqual(1);
    }

    const composer = page.locator('textarea[placeholder="Type a message..."]');
    await expect(composer).toHaveCount(1);
    await composer.scrollIntoViewIfNeeded();
    await composer.click();
    await composer.type('hello from playwright');
    await page.waitForTimeout(50);

    const scrollCallsAfterTyping = await getScrollCallCount();
    expect(scrollCallsAfterTyping - scrollCallsAfterRestore).toBe(0);

    const heightAfterTyping = await getConversationHeight();
    expect(Math.abs(heightAfterTyping - restoredHeight)).toBeLessThanOrEqual(1);

    const scrollTopAfterTyping = await getActiveScrollTop();
    if (scrollTopAfterRestore !== null && scrollTopAfterTyping !== null) {
      expect(Math.abs(scrollTopAfterTyping - scrollTopAfterRestore)).toBeLessThanOrEqual(1);
    }

    const filteredErrors = consoleErrors.filter(
      (entry) => !allowedWarningPatterns.some((pattern) => pattern.test(entry)),
    );

    const hasCrash = filteredErrors.some((entry) =>
      crashSignatures.some((signature) => entry.includes(signature)),
    );

    expect(hasCrash, `Console errors:\n${consoleErrors.join('\n')}`).toBe(false);
    expect(filteredErrors, `Unexpected console errors:\n${filteredErrors.join('\n')}`).toHaveLength(0);
  });
});
