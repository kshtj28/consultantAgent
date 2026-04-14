/**
 * Per-answer file attachments for interview sessions.
 *
 * A user can attach a file to a specific question's answer. The file is processed
 * through the same chunk + embed + index pipeline as Knowledge Base uploads, but
 * tagged with `metadata.sessionId` and `metadata.questionId` so it can be
 * retrieved exclusively for that session when generating subsequent questions.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { processDocument, isValidFileType, getFileType } from '../services/documentProcessor';
import { processAndIndexDocument } from '../services/knowledgeBase';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});

const upload = multer({
    storage,
    limits: { fileSize: parseInt(env.MAX_FILE_SIZE, 10) },
    fileFilter: (_req, file, cb) => {
        if (isValidFileType(file.originalname)) cb(null, true);
        else cb(new Error('Invalid file type. Supported: PDF, DOCX, TXT, CSV, XLSX'));
    },
});

// POST /api/interview/:sessionId/attachment — upload a file scoped to this session
router.post('/:sessionId/attachment', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const { sessionId } = req.params;
        const questionId = (req.body.questionId as string) || '';
        const userId = (req as AuthRequest).user?.userId || 'anonymous';

        const filePath = req.file.path;
        const filename = req.file.originalname;
        const fileType = getFileType(filename);

        const parsed = await processDocument(filePath);

        const documentId = await processAndIndexDocument(
            parsed.content,
            filename,
            fileType,
            userId,
            {
                sessionId,
                questionId,
                scope: 'answer-attachment',
                originalPath: filePath,
                ...parsed.metadata,
            }
        );

        // Short excerpt for client display + persistence on the answer record
        const excerpt = parsed.content.replace(/\s+/g, ' ').slice(0, 320).trim();

        return res.status(201).json({
            success: true,
            documentId,
            filename,
            fileType,
            excerpt,
        });
    } catch (err: any) {
        console.error('Error uploading interview attachment:', err);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
