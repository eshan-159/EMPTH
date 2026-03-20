import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafePath } from './safePaths.js';
import { createPdfTool } from './pdfTools.js';

/**
 * convert_file tool.
 * Supported currently:
 * - output_format: 'pdf' (from txt/md/html treated as plain text)
 *
 * @param {{ input_path: string, output_format: string }} params
 */
export async function convertFileTool(params) {
  const inputAbs = resolveSafePath(params.input_path);
  const outputFormat = String(params.output_format || '').toLowerCase();

  if (outputFormat !== 'pdf') {
    throw new Error(`Unsupported output_format: ${params.output_format}. Supported: pdf`);
  }

  const content = await fs.readFile(inputAbs, 'utf8');
  const baseName = path.basename(inputAbs, path.extname(inputAbs));
  const filename = `${baseName}.pdf`;

  const result = await createPdfTool({ content, path: filename });
  return {
    input_path: params.input_path,
    output_format: outputFormat,
    output_path: result.output_path
  };
}
