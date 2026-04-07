import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { processDocument, isValidFileType, getFileType } from '../services/documentProcessor';
import { processAndIndexDocument, deleteDocument, listDocuments } from '../services/knowledgeBase';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(env.MAX_FILE_SIZE, 10),
    },
    fileFilter: (req, file, cb) => {
        if (isValidFileType(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Supported: PDF, DOCX, TXT, CSV, XLSX'));
        }
    },
});

// Upload and process document
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const userId = req.body.userId || 'default-user';
        const filePath = req.file.path;
        const filename = req.file.originalname;
        const fileType = getFileType(filename);

        // Parse the document
        const parsed = await processDocument(filePath);

        // Process and index in OpenSearch
        const documentId = await processAndIndexDocument(
            parsed.content,
            filename,
            fileType,
            userId,
            {
                originalPath: filePath,
                ...parsed.metadata,
            }
        );

        res.status(201).json({
            success: true,
            documentId,
            filename,
            fileType,
            metadata: parsed.metadata,
            message: 'Document uploaded and indexed successfully',
        });
    } catch (error: any) {
        console.error('Error uploading document:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all documents
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string | undefined;
        const documents = await listDocuments(userId);
        res.json({ documents });
    } catch (error: any) {
        console.error('Error listing documents:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a document
router.delete('/:documentId', async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;
        await deleteDocument(documentId);
        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
