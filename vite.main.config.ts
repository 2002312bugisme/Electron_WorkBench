import { defineConfig } from 'vite';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectRoot = process.cwd();
const runtimePackages = ['better-sqlite3-multiple-ciphers', 'archiver', 'unzipper'];

function copyRuntimeDependencies() {
  const copied = new Set<string>();
  const sourceModules = path.join(projectRoot, 'node_modules');
  const targetModules = path.join(projectRoot, '.vite', 'build', 'node_modules');
  const packageRoot = (name: string, from: string) => {
    // A resolver rooted inside the calling package mirrors Node's CommonJS lookup order,
    // including nested dependencies that npm has not hoisted to the top level.
    const resolver = createRequire(path.join(from, '__runtime_dependency_resolver__.js'));
    const entry = resolver.resolve(name);
    let current = path.dirname(entry);
    while (!existsSync(path.join(current, 'package.json'))) {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Cannot find package root for ${name}`);
      current = parent;
    }
    return current;
  };
  const copyPackage = (name: string, from = sourceModules) => {
    let source: string;
    try { source = packageRoot(name, from); } catch { return; }
    if (copied.has(source)) return;
    copied.add(source);
    // Preserve npm's nested/hoisted layout so every CommonJS require resolves exactly as it did in development.
    const target = path.join(targetModules, path.relative(sourceModules, source));
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).forEach((dependency) => copyPackage(dependency, source));
  };
  const validatePackage = (name: string, from = targetModules, verified = new Set<string>()) => {
    const target = packageRoot(name, from);
    if (verified.has(target)) return;
    verified.add(target);
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).forEach((dependency) => validatePackage(dependency, target, verified));
  };
  return {
    name: 'copy-electron-runtime-dependencies',
    closeBundle() {
      runtimePackages.forEach((packageName) => copyPackage(packageName));
      runtimePackages.forEach((packageName) => validatePackage(packageName));
      const nativeBinding = path.join(targetModules, 'better-sqlite3-multiple-ciphers', 'prebuilds', 'win32-x64.node');
      if (!existsSync(nativeBinding)) throw new Error(`Missing Windows SQLCipher binding: ${nativeBinding}`);
    },
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
