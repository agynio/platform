import { waitForPageReady, type TestRunnerConfig } from '@storybook/test-runner';

const config: TestRunnerConfig = {
  tags: {
    include: ['smoke'],
    skip: ['test:skip'],
  },
  async preVisit(page, context) {
    const readySelector = context.parameters?.test?.readySelector;

    if (readySelector) {
      await Promise.race([
        waitForPageReady(page),
        page.waitForSelector(readySelector, {
          state: 'visible',
          timeout: 30_000,
        }),
      ]);
      return;
    }

    await waitForPageReady(page);
  },
};

export default config;
