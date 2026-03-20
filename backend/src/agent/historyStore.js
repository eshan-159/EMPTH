import fs from 'node:fs/promises';
import path from 'node:path';

function dataPath() {
  return path.resolve('./data/history.json');
}

async function ensureDataDir() {
  await fs.mkdir(path.dirname(dataPath()), { recursive: true });
}

export class HistoryStore {
  async append(entry) {
    await ensureDataDir();
    const items = await this.list().catch(() => []);
    items.unshift(entry);
    await fs.writeFile(dataPath(), JSON.stringify(items.slice(0, 200), null, 2), 'utf8');
  }

  async list() {
    const txt = await fs.readFile(dataPath(), 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  }
}
