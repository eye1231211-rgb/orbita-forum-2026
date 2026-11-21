import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
// This build deliberately does not load vite.config.ts, Vinext, Wrangler or
// Cloudflare plugins. It reuses the authored React interface and styles.
await build({
  configFile:false,
  root:resolve(projectRoot,'portable'),
  publicDir:resolve(projectRoot,'public'),
  plugins:[react()],
  resolve:{alias:{'@':projectRoot}},
  build:{outDir:resolve(projectRoot,'dist-portable/client'),emptyOutDir:true,sourcemap:false},
});
