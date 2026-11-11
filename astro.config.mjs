import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages project site: https://gregolive.github.io/japanese-word-of-the-day/
export default defineConfig({
  site: 'https://gregolive.github.io',
  base: '/japanese-word-of-the-day',
  vite: {
    plugins: [tailwindcss()],
  },
});
