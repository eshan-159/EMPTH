import { fileTools } from './tools/src/fileTools.js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend/.env manually for test
dotenv.config({ path: path.resolve('backend/.env') });

console.log('WORKDIR:', process.env.ASSISTANT_WORKDIR);

async function test() {
  try {
    const res = await fileTools.create_folder({ path: 'TestFolder_Verified' });
    console.log('Result:', res);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();