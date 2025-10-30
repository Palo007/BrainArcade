// Ensure Tailwind and Autoprefixer run with Vite
// Vite auto-detects this config and applies PostCSS plugins
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};

