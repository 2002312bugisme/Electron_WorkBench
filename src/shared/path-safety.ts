import path from 'node:path';

/** True only when a resolved candidate remains inside the authorised resolved root. */
export const isPathWithinRoot = (root: string, candidate: string) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
