import { useEffect, useState, useRef } from 'react';
import { Upload, FileText, Trash2, Loader } from 'lucide-react';
import SectionCard from '../components/shared/SectionCard';
import { listDocuments, deleteDocument } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import './KnowledgeBase.css';

export default function KnowledgeBase() {
    const { t } = useLanguage();
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        listDocuments()
            .then((res) => setDocuments(res.documents || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleUpload = async (file: File) => {
        setUploading(true);
        setUploadError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const token = localStorage.getItem('token');
            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }
            const docRes = await listDocuments();
            setDocuments(docRes.documents || []);
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteDoc = async (documentId: string) => {
        if (!confirm(t('kb.deleteDoc'))) return;
        try {
            await deleteDocument(documentId);
            setDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
        } catch (err: any) {
            setUploadError(err.message);
        }
    };

    return (
        <div className="knowledge-base">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">{t('kb.title')}</h1>
                    <p className="page-header__subtitle">{t('kb.subtitle')}</p>
                </div>
            </div>

            <SectionCard
                title={t('kb.title')}
                headerRight={
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {documents.length} documents
                    </span>
                }
            >
                <div
                    className="kb-upload-zone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleUpload(f);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                            e.target.value = '';
                        }}
                    />
                    {uploading ? (
                        <><Loader size={18} className="spin" /> {t('kb.uploading')}</>
                    ) : (
                        <><Upload size={18} /> {t('kb.uploadDrop')}</>
                    )}
                </div>
                {uploadError && <div className="kb-error">{uploadError}</div>}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <Loader size={20} className="spin" />
                    </div>
                ) : documents.length === 0 ? (
                    <p className="kb-empty">{t('kb.noDocuments')}</p>
                ) : (
                    <div className="kb-doc-list">
                        {documents.map((doc) => (
                            <div key={doc.documentId} className="kb-doc-item">
                                <FileText size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                <span className="kb-doc-name">{doc.filename}</span>
                                <span className="kb-doc-meta">{doc.fileType} · {doc.totalChunks} chunks</span>
                                <button
                                    className="kb-doc-delete"
                                    onClick={() => handleDeleteDoc(doc.documentId)}
                                    title="Delete"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
