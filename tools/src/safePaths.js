import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function getWorkDir() {
  // default: repository root / user-provided
  return path.resolve(process.env.ASSISTANT_WORKDIR || process.cwd());
}

/**
 * @param {string} unsafePath
 */
export function resolveSafePath(unsafePath) {
  let resolved = unsafePath;

  // Handle tilde expansion
  if (resolved.startsWith('~/')) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  } else if (resolved === '~') {
    resolved = os.homedir();
  }

  // If absolute, use as is (if allowed). If relative, resolve against workdir.
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(getWorkDir(), resolved);
  }

  // Check strict confinement? 
  // For this user on their own machine, we might want to be lenient and allow Desktop/Downloads/Documents/Home.
  // But let's verify if it matches the INTENDED destination.
  
  // If WORKDIR is /Users/user/Desktop, and resolved is /Users/user/Desktop/Desktop/Test, that's a common LLM error.
  // Fix double Desktop:
  const desktopPath = path.join(os.homedir(), 'Desktop');
  const doubleDesktop = path.join(desktopPath, 'Desktop');
  if (resolved.startsWith(doubleDesktop)) {
     resolved = resolved.replace(doubleDesktop, desktopPath);
  }

  // Ensure we are inside allowed areas (Home directory or specific workdir)
  // For now, allow anything under User Home to be safe.
  const home = os.homedir();
  if (!resolved.startsWith(home)) {
     // If it's outside home (e.g. /tmp), maybe block or maybe allow. 
     // Let's stick to the previous safe logic: Must be under WORKDIR, OR under Desktop/Documents/Downloads
     const allowedRoots = [
       getWorkDir(),
       path.join(home, 'Desktop'),
       path.join(home, 'Documents'),
       path.join(home, 'Downloads'),
       home // Actually, let's just allow Home for maximum utility as a local assistant
     ];
     
     const isAllowed = allowedRoots.some(root => resolved.startsWith(root));
     if (!isAllowed) {
       // Fallback: force relative to WORKDIR if it looks like a mistake
       // But if unsafePath was absolute, we just return error.
       throw new Error(`Path escapes allowed directories: ${resolved}`);
     }
  }

  return resolved;
}


export async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
