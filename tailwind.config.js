import { scopedPreflightStyles, isolateInsideOfContainer } from 'tailwindcss-scoped-preflight';

// https://github.com/zaichaopan/react-aria-components-tailwind-starter/blob/c15f630866480e00d7a39258db0f61b39704e00e/tailwind.config.js

const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        accent: 'hsl(var(--accent))',
        success: 'hsl(var(--success))',
        destructive: 'hsl(var(--destructive))',
        warning: 'hsl(var(--warning))',
        hover: 'hsl(var(--hover))',
        muted: 'hsl(var(--muted))',
        border: 'hsl(var(--border))',
      },
    },
  },
  plugins: [
    require('tailwindcss-react-aria-components'),
    require('tailwindcss-animate'),
    require('@tailwindcss/container-queries'),
    scopedPreflightStyles({
      isolationStrategy: isolateInsideOfContainer('.twp', {}),
    }),
  ],
  important: true,
}

