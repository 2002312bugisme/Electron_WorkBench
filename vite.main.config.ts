import { defineConfig } from 'vite';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const runtimePackages = ['better-sqlite3-multiple-ciphers', 'archiver', 'unzipper'];

function copyRuntimeDependencies() {
  const copied = new Set<string>();
  const copyPackage = (name: string) => {
    if (copied.has(name)) return;
    const source = path.join(projectRoot, 'node_modules', ...name.split('/'));
    if (!existsSync(source)) return;
    copied.add(name);
    const target = path.join(projectRoot, '.vite', 'build', 'node_modules', ...name.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).forEach(copyPackage);
  };
  return {
    name: 'copy-electron-runtime-dependencies',
    closeBundle() { runtimePackages.forEach(copyPackage); },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['archiver', 'unzipper', 'better-sqlite3-multiple-ciphers'],
    },
  },
  plugins: [copyRuntimeDependencies()],
});
