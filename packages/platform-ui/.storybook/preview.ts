import type { Preview } from '@storybook/react-vite';
import '../src/styles/tailwind.css';
import '../src/styles/globals.css';
import '../src/styles/shadcn-compat.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    options: {
      storySort: {
        order: ['Brand', 'Foundation', 'Components', 'Layouts', 'Screens'],
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
};

export default preview;
