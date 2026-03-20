import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveSafePath, ensureParentDir } from './safePaths.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function getWorkDir() {
  const configured = process.env.ASSISTANT_WORKDIR;
  if (configured && path.isAbsolute(configured)) return configured;
  if (configured) return path.resolve(REPO_ROOT, configured);
  return REPO_ROOT;
}

/**
 * create_pdf tool.
 * @param {{ content: string, filename: string, path: string }} params
 */
export async function createPdfTool(params) {
  // Prefer params.path if available (standardize to one param ideally)
  const relPath = params.path || params.filename;
  console.log(`[Tool:create_pdf] Requested path: "${params.path}", filename: "${params.filename}" -> resolved: "${relPath}"`);
  if (!relPath) throw new Error('Missing path or filename');

  const outputPath = resolveSafePath(relPath);
  console.log(`[Tool:create_pdf] Writing to: ${outputPath}`);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = 12;
  const margin = 50;
  const width = page.getWidth() - margin * 2;
  const lines = wrapText(params.content, font, fontSize, width);
  const { height } = page.getSize();

  let currentPage = page;
  let y = height - margin;

  const drawText = (line, pageObj) => {
    pageObj.drawText(line, {
      x: margin,
      y,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  };

  for (const line of lines) {
    if (y < margin) {
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin - fontSize;
    }
    drawText(line, currentPage);
    y -= (fontSize + 4);
  }

  const bytes = await pdfDoc.save();
  await ensureParentDir(outputPath);
  
  console.log(`[Tool:create_pdf] Writing ${bytes.length} bytes to: ${outputPath}`);
  await fs.writeFile(outputPath, bytes);

  // Verification step: Check if file exists and has content
  const stats = await fs.stat(outputPath);
  if (stats.size === 0) throw new Error('File created but is empty');

  return { output_path: outputPath, bytesWritten: stats.size, success: true };
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = String(text || '').replace(/\r/g, '').split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
