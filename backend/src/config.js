import './env.js';

export const config = {
  port: Number(process.env.BACKEND_PORT || 3001),
  workdir: process.env.ASSISTANT_WORKDIR,
  outputDir: process.env.ASSISTANT_OUTPUT_DIR,
  backendBaseUrl: process.env.BACKEND_BASE_URL
};
