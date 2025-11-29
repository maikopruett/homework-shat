import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up PDF.js worker using local bundled version
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ParsedFile {
  name: string;
  type: string;
  content: string;
  isHtml: boolean; // true if content is already HTML with formatting preserved
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  const extension = name.split('.').pop()?.toLowerCase();

  let content: string;
  let isHtml = false;

  switch (extension) {
    case 'txt':
      content = await parseTxtFile(file);
      break;
    case 'pdf':
      content = await parsePdfFile(file);
      break;
    case 'docx':
      content = await parseDocxFile(file);
      isHtml = true; // docx is converted to HTML with formatting
      break;
    case 'html':
    case 'htm':
      content = await parseHtmlFile(file);
      isHtml = true; // HTML files preserve all styling
      break;
    default:
      throw new Error(`Unsupported file type: .${extension}`);
  }

  return { name, type: extension || 'unknown', content, isHtml };
}

async function parseTxtFile(file: File): Promise<string> {
  return file.text();
}

async function parseHtmlFile(file: File): Promise<string> {
  const html = await file.text();
  
  // Extract just the body content if it's a full HTML document
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  
  // If no body tag, return the content as-is (might be a fragment)
  return html.trim();
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
  // Use convertToHtml to preserve semantic formatting (bold, italic, headings, lists, etc.)
  // Note: mammoth.js does NOT preserve visual styling like fonts, colors, or sizes by design.
  // For full formatting preservation, use HTML export from Word instead.
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: [
      // Map common Word styles to HTML elements
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      // Preserve underline
      "u => u",
      // Preserve strikethrough
      "strike => s",
      // Preserve subscript and superscript
      "verticalAlignment[value='subscript'] => sub:fresh",
      "verticalAlignment[value='superscript'] => sup:fresh",
    ],
    // Include default style mappings for bold, italic, lists, etc.
    includeDefaultStyleMap: true,
  });
  return result.value;
}

export function isValidFileType(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ['txt', 'pdf', 'docx', 'html', 'htm'].includes(extension || '');
}

export function getAcceptedFileTypes(): string {
  return '.txt,.pdf,.docx,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html';
}

