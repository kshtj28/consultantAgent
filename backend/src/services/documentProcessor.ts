import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { parse as csvParse } from 'csv-parse/sync';

export interface ParsedDocument {
    content: string;
    metadata: {
        pageCount?: number;
        wordCount: number;
        characterCount: number;
    };
}

// Parse PDF files
export async function parsePDF(filePath: string): Promise<ParsedDocument> {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return {
        content: data.text,
        metadata: {
            pageCount: data.numpages,
            wordCount: data.text.split(/\s+/).length,
            characterCount: data.text.length,
        },
    };
}

// Parse DOCX files
export async function parseDOCX(filePath: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ path: filePath });
    const content = result.value;

    return {
        content,
        metadata: {
            wordCount: content.split(/\s+/).length,
            characterCount: content.length,
        },
    };
}

// Parse TXT files
export async function parseTXT(filePath: string): Promise<ParsedDocument> {
    const content = fs.readFileSync(filePath, 'utf-8');

    return {
        content,
        metadata: {
            wordCount: content.split(/\s+/).length,
            characterCount: content.length,
        },
    };
}

// Parse CSV files
export async function parseCSV(filePath: string): Promise<ParsedDocument> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = csvParse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    });

    // Convert CSV to readable text format
    let content = '';
    if (records.length > 0) {
        const headers = Object.keys(records[0]);
        content = `Columns: ${headers.join(', ')}\n\n`;

        records.forEach((record: Record<string, string>, index: number) => {
            content += `Row ${index + 1}:\n`;
            headers.forEach((header) => {
                content += `  ${header}: ${record[header]}\n`;
            });
            content += '\n';
        });
    }

    return {
        content,
        metadata: {
            wordCount: content.split(/\s+/).length,
            characterCount: content.length,
        },
    };
}

// Parse Excel files (XLSX)
export async function parseExcel(filePath: string): Promise<ParsedDocument> {
    // For Excel, we'll use csv-parse after converting
    // This is a simplified version - for full Excel support, use xlsx library
    const content = fs.readFileSync(filePath, 'utf-8');

    return {
        content: `Excel file content requires xlsx library for full parsing. File: ${path.basename(filePath)}`,
        metadata: {
            wordCount: 0,
            characterCount: 0,
        },
    };
}

// Main document processor
export async function processDocument(filePath: string): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.pdf':
            return parsePDF(filePath);
        case '.docx':
            return parseDOCX(filePath);
        case '.txt':
            return parseTXT(filePath);
        case '.csv':
            return parseCSV(filePath);
        case '.xlsx':
        case '.xls':
            return parseExcel(filePath);
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}

// Get file type from extension
export function getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const typeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return typeMap[ext] || 'application/octet-stream';
}

// Validate file type
export function isValidFileType(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    const validExtensions = ['.pdf', '.docx', '.txt', '.csv', '.xlsx', '.xls'];
    return validExtensions.includes(ext);
}
