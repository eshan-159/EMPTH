import { createPdfTool } from './pdfTools.js';
import { fileTools } from './fileTools.js';
import { convertFileTool } from './convertTools.js';

export const toolRegistry = {
  create_pdf: createPdfTool,
  convert_file: convertFileTool,
  write_text_file: fileTools.write_text_file,
  read_file: fileTools.read_file,
  create_folder: fileTools.create_folder,
  list_files: fileTools.list_files
};
