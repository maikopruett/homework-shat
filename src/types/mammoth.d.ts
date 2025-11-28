declare module 'mammoth' {
  interface ExtractRawTextResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  interface ArrayBufferInput {
    arrayBuffer: ArrayBuffer;
  }

  export function extractRawText(input: ArrayBufferInput): Promise<ExtractRawTextResult>;
}

