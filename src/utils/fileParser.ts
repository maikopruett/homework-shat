import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up PDF.js worker using local bundled version
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ParsedFile {
  name: string;
  type: string;
  content: string;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  const extension = name.split('.').pop()?.toLowerCase();

  let content: string;

  switch (extension) {
    case 'txt':
      content = await parseTxtFile(file);
      break;
    case 'pdf':
      content = await parsePdfFile(file);
      break;
    case 'docx':
      content = await parseDocxFile(file);
      break;
    default:
      throw new Error(`Unsupported file type: .${extension}`);
  }

  return { name, type: extension || 'unknown', content };
}

async function parseTxtFile(file: File): Promise<string> {
  return file.text();
}

async function parsePdfFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const textParts: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    textParts.push(pageText);
  }
  
  return textParts.join('\n\n');
}

async function parseDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export function isValidFileType(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ['txt', 'pdf', 'docx'].includes(extension || '');
}

export function getAcceptedFileTypes(): string {
  return '.txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
}

