import type { Preview } from '@storybook/react-vite';
import { initialize, mswDecorator } from 'msw-storybook-addon';
import { ScreenStoryProviders, type ScreenParameters } from './ScreenStoryProviders';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/styles/tailwind.css';
import '../src/styles/globals.css';
import '../src/styles/shadcn-compat.css';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    options: {
      storySort: {
        order: ['Brand', 'Foundation', 'Components', 'Layouts', 'Screens', 'Pages'],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    mswDecorator,
    (Story, context) => {
      const screen = (context.parameters.screen ?? {}) as ScreenParameters;
      const routePath = screen.routePath ?? '*';
      const initialEntry = screen.initialEntry ?? '/';
      return (
        <ScreenStoryProviders routePath={routePath} initialEntry={initialEntry}>
          <TooltipProvider delayDuration={200}>
            <Story />
          </TooltipProvider>
        </ScreenStoryProviders>
      );
    },
  ],
};

export default preview;
