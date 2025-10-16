// Tailwind v4 friendly preset via CSS variables mapping
const preset = {
  theme: {
    colors: {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      card: 'var(--card)',
      'card-foreground': 'var(--card-foreground)',
      popover: 'var(--popover)',
      'popover-foreground': 'var(--popover-foreground)',
      primary: 'var(--primary)',
      'primary-foreground': 'var(--primary-foreground)',
      secondary: 'var(--secondary)',
      'secondary-foreground': 'var(--secondary-foreground)',
      muted: 'var(--muted)',
      'muted-foreground': 'var(--muted-foreground)',
      accent: 'var(--accent)',
      'accent-foreground': 'var(--accent-foreground)',
      destructive: 'var(--destructive)',
      border: 'var(--border)',
      input: 'var(--input)',
      ring: 'var(--ring)',
      sidebar: 'var(--sidebar)',
      'sidebar-foreground': 'var(--sidebar-foreground)',
      'sidebar-primary': 'var(--sidebar-primary)',
      'sidebar-primary-foreground': 'var(--sidebar-primary-foreground)',
      'sidebar-accent': 'var(--sidebar-accent)',
      'sidebar-accent-foreground': 'var(--sidebar-accent-foreground)',
      'sidebar-border': 'var(--sidebar-border)',
      'sidebar-ring': 'var(--sidebar-ring)'
    },
    borderRadius: {
      none: 'var(--radius-none)',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      '3xl': 'var(--radius-3xl)',
      full: 'var(--radius-full)'
    },
    boxShadow: {
      xs: '0 1px 1px 0 rgb(0 0 0 / 0.03)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)'
    },
    spacing: {
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      6: '24px',
      8: '32px',
      12: '48px',
      16: '64px',
      24: '96px'
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)'
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px'
    }
  },
  darkMode: 'class'
};

export default preset;

