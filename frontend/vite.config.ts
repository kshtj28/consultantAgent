import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
            '/ollama': {
                target: 'http://localhost:11434',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ollama/, ''),
            },
        },
    },
});
