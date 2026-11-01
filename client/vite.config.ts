import { defineConfig } from 'vite';

// relative base so the build works under any path (e.g. /urwort/proto/)
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 2000 } });
