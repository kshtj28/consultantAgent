// Type declarations for modules without types
declare module 'pdf-parse' {
    interface PDFData {
        numpages: number;
        numrender: number;
        text: string;
        info: Record<string, unknown>;
        metadata: Record<string, unknown>;
    }

    function pdfParse(dataBuffer: Buffer): Promise<PDFData>;
    export = pdfParse;
}
