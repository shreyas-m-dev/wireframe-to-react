// App styles only. Generated code is styled inside the preview frame by its
// own stylesheet (preview/vite-plugin-preview-frame.js), so no safelist here.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: { 1: token('surface-1'), 2: token('surface-2') },
        border: { DEFAULT: token('border'), strong: token('border-strong') },
        text: { DEFAULT: token('text'), muted: token('text-muted'), subtle: token('text-subtle') },
        accent: { DEFAULT: token('accent'), bg: token('accent-bg'), on: token('on-accent') },
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '450' }],
        label: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        body: ['14px', { lineHeight: '22px' }],
        title: ['18px', { lineHeight: '26px', fontWeight: '600' }],
        display: ['28px', { lineHeight: '34px', fontWeight: '650' }],
        code: ['13px', { lineHeight: '20px' }],
      },
      borderRadius: { sm: '6px', md: '10px', lg: '16px', xl: '22px' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)' },
      transitionDuration: { fast: 'var(--dur-fast)', base: 'var(--dur-base)' },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
};
