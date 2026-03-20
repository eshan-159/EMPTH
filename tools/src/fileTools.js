import fs from 'node:fs/promises';
import { resolveSafePath, ensureParentDir } from './safePaths.js';

export const fileTools = {
  /** @param {{ path: string }} params */
  async read_file(params) {
    const abs = resolveSafePath(params.path);
    const content = await fs.readFile(abs, 'utf8');
    return { path: params.path, content };
  },

  /** @param {{ content: string, path: string }} params */
  async write_text_file(params) {
    const abs = resolveSafePath(params.path);
    await ensureParentDir(abs);
    await fs.writeFile(abs, params.content, 'utf8');
    return { path: params.path, bytesWritten: Buffer.byteLength(params.content, 'utf8') };
  },

  /** @param {{ path: string }} params */
  async create_folder(params) {
    const abs = resolveSafePath(params.path);
    console.log(`[Tool:create_folder] Creating directory: ${abs}`);
    await fs.mkdir(abs, { recursive: true });
    return { path: params.path, created: true };
  },

  /** @param {{ path: string }} params */
  async list_files(params) {
    const abs = resolveSafePath(params.path || '.');
    const items = await fs.readdir(abs, { withFileTypes: true });
    return items.map(d => ({
      name: d.name,
      isDirectory: d.isDirectory()
    }));
  }
};
