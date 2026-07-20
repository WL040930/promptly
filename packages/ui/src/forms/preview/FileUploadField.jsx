import { useState } from 'react';
import { compressImage } from '../editor/fields/imageUtils';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const UploadedFileCard = ({ value, onClear }) => (
    <div className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4 truncate">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
                </svg>
            </div>
            <div className="truncate">
                <p className="text-[15px] font-bold text-emerald-900 truncate">File Uploaded</p>
                <a href={value} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline truncate block">
                    View File
                </a>
            </div>
        </div>
        <button type="button" onClick={onClear} aria-label="Remove uploaded file" className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        </button>
    </div>
);

const DropZone = ({ id, accept, isUploading, onChange }) => (
    <div className="relative border-2 border-dashed border-gray-300 bg-white rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 cursor-pointer group">
        <input
            id={id}
            type="file"
            accept={accept || '*/*'}
            onChange={onChange}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        {isUploading ? (
            <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-[15px] font-semibold text-gray-700">Uploading...</p>
            </div>
        ) : (
            <>
                <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                    <svg className="text-gray-400 group-hover:text-gray-600 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                </div>
                <p className="text-[15px] font-semibold text-gray-700 mb-1">Click to upload or drag and drop</p>
                <p className="text-xs font-medium text-gray-500">Supports {accept || 'all files'}</p>
            </>
        )}
    </div>
);

const UploadErrorMessage = ({ message }) => (
    <div className="mt-3 text-sm text-red-500 font-medium flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {message}
    </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FileUploadField = ({ field, value, onChange, labelEl }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileSelect = async (e) => {
        let file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadError(null);

        try {
            file = await compressImage(file);

            const ext = file.name.split('.').pop() || 'bin';
            const secureFileName = `${crypto.randomUUID()}.${ext}`;

            const response = await fetch(`/api/storage/upload/${secureFileName}`, {
                method: 'POST',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            });

            if (!response.ok) throw new Error('Failed to upload file');

            // Use backend proxy URL instead of exposing raw storage URLs
            onChange?.(`/api/storage/download/${secureFileName}`);
        } catch (err) {
            console.error('Upload Error:', err);
            setUploadError(err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="animate-slide-up-fade">
            {labelEl}
            {value
                ? <UploadedFileCard value={value} onClear={() => onChange?.('')} />
                : <DropZone id={`field-${field.id}`} accept={field.accept} isUploading={isUploading} onChange={handleFileSelect} />
            }
            {uploadError && <UploadErrorMessage message={uploadError} />}
        </div>
    );
};

export default FileUploadField;
