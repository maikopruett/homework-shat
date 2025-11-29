declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  interface ArrayBufferInput {
    arrayBuffer: ArrayBuffer;
  }

  interface ConvertOptions {
    styleMap?: string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: (image: { read: (encoding: string) => Promise<Buffer> }) => Promise<{ src: string }>;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    transformDocument?: (document: unknown) => unknown;
  }

  export function extractRawText(input: ArrayBufferInput): Promise<MammothResult>;
  export function convertToHtml(input: ArrayBufferInput, options?: ConvertOptions): Promise<MammothResult>;
}

