import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    parsePDF,
    parseDOCX,
    parseTXT,
    parseCSV,
    processDocument,
    isValidFileType,
    getFileType,
} from '../services/documentProcessor';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn(),
        existsSync: vi.fn(),
    },
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
    default: vi.fn().mockResolvedValue({
        numpages: 5,
        text: 'This is mock PDF content. It contains important business processes.',
    }),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
    default: {
        extractRawText: vi.fn().mockResolvedValue({
            value: 'This is mock DOCX content with business information.',
        }),
    },
}));

describe('Document Processor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isValidFileType', () => {
        it('should return true for PDF files', () => {
            expect(isValidFileType('document.pdf')).toBe(true);
        });

        it('should return true for DOCX files', () => {
            expect(isValidFileType('document.docx')).toBe(true);
        });

        it('should return true for TXT files', () => {
            expect(isValidFileType('document.txt')).toBe(true);
        });

        it('should return true for CSV files', () => {
            expect(isValidFileType('data.csv')).toBe(true);
        });

        it('should return true for XLSX files', () => {
            expect(isValidFileType('spreadsheet.xlsx')).toBe(true);
        });

        it('should return false for unsupported file types', () => {
            expect(isValidFileType('image.png')).toBe(false);
            expect(isValidFileType('script.js')).toBe(false);
            expect(isValidFileType('document.html')).toBe(false);
        });

        it('should handle uppercase extensions', () => {
            expect(isValidFileType('document.PDF')).toBe(true);
            expect(isValidFileType('document.DOCX')).toBe(true);
        });
    });

    describe('getFileType', () => {
        it('should return correct MIME type for PDF', () => {
            expect(getFileType('document.pdf')).toBe('application/pdf');
        });

        it('should return correct MIME type for DOCX', () => {
            expect(getFileType('document.docx')).toBe(
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            );
        });

        it('should return correct MIME type for TXT', () => {
            expect(getFileType('document.txt')).toBe('text/plain');
        });

        it('should return correct MIME type for CSV', () => {
            expect(getFileType('data.csv')).toBe('text/csv');
        });

        it('should return octet-stream for unknown types', () => {
            expect(getFileType('file.xyz')).toBe('application/octet-stream');
        });
    });

    describe('parseTXT', () => {
        it('should parse TXT file content', async () => {
            const mockContent = 'This is a sample text file with business content.\nLine 2 of the document.';
            vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

            const result = await parseTXT('/path/to/file.txt');

            expect(result.content).toBe(mockContent);
            expect(result.metadata.wordCount).toBeGreaterThan(0);
            expect(result.metadata.characterCount).toBe(mockContent.length);
        });
    });

    describe('parseCSV', () => {
        it('should parse CSV file content', async () => {
            const mockCSV = 'name,value,status\nProcess A,100,Active\nProcess B,200,Inactive';
            vi.mocked(fs.readFileSync).mockReturnValue(mockCSV);

            const result = await parseCSV('/path/to/data.csv');

            expect(result.content).toContain('Columns:');
            expect(result.content).toContain('name');
            expect(result.content).toContain('Process A');
            expect(result.metadata.wordCount).toBeGreaterThan(0);
        });
    });

    describe('parsePDF', () => {
        it('should parse PDF file content', async () => {
            vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('mock pdf data'));

            const result = await parsePDF('/path/to/document.pdf');

            expect(result.content).toContain('mock PDF content');
            expect(result.metadata.pageCount).toBe(5);
            expect(result.metadata.wordCount).toBeGreaterThan(0);
        });
    });

    describe('parseDOCX', () => {
        it('should parse DOCX file content', async () => {
            const result = await parseDOCX('/path/to/document.docx');

            expect(result.content).toContain('mock DOCX content');
            expect(result.metadata.wordCount).toBeGreaterThan(0);
        });
    });

    describe('processDocument', () => {
        it('should route PDF files to parsePDF', async () => {
            vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('mock data'));

            const result = await processDocument('/path/to/file.pdf');
            expect(result.content).toBeDefined();
        });

        it('should route TXT files to parseTXT', async () => {
            vi.mocked(fs.readFileSync).mockReturnValue('text content');

            const result = await processDocument('/path/to/file.txt');
            expect(result.content).toBe('text content');
        });

        it('should throw error for unsupported file types', async () => {
            await expect(processDocument('/path/to/file.xyz')).rejects.toThrow(
                'Unsupported file type'
            );
        });
    });
});
