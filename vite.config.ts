import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function spaStaticPagesPlugin() {
  return {
    name: 'spa-static-pages',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        // Ensure /welcome directory exists with an index.html copy
        const welcomeDir = path.join(distDir, 'welcome');
        if (!fs.existsSync(welcomeDir)) {
          fs.mkdirSync(welcomeDir, { recursive: true });
        }
        fs.copyFileSync(indexPath, path.join(welcomeDir, 'index.html'));

        // Ensure 404.html exists for static hosting providers
        fs.copyFileSync(indexPath, path.join(distDir, '404.html'));

        // Ensure _redirects file exists for Netlify / Cloudflare Pages
        fs.writeFileSync(path.join(distDir, '_redirects'), '/*    /index.html   200\n', 'utf-8');
      }
    }
  };
}

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
        },
        proxy: {
          '/__': {
            target: 'https://gen-lang-client-0320558179.firebaseapp.com',
            changeOrigin: true,
            secure: true
          }
        },
        hmr: {
          overlay: false
        }
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
        },
        proxy: {
          '/__': {
            target: 'https://gen-lang-client-0320558179.firebaseapp.com',
            changeOrigin: true,
            secure: true
          }
        }
      },
      plugins: [react(), spaStaticPagesPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
