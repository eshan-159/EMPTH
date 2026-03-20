import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// frontend/src -> frontend -> repo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
