import type { Config } from 'tailwindcss';
import preset from './src/tailwind-preset';

export default {
  presets: [preset],
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}', './.storybook/**/*.{ts,tsx,mdx}']
} satisfies Config;
