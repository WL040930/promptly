import React, { useState } from 'react';

const FileUploadField = ({ field, value, onChange, labelEl }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const compressImage = (file) => {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/') || file.type === 'image/gif') {
                return resolve(file); // Don't compress non-images or GIFs
            }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1080;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', 0.8); // 80% quality JPEG
                };
                img.onerror = () => resolve(file); // Fallback on error
            };
            reader.onerror = () => resolve(file);
        });
    };

    const handleFileSelect = async (e) => {
        let file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadError(null);

        try {
            // Compress image if applicable
            file = await compressImage(file);

            // Generate a secure UUID for the file name to prevent collisions
            const ext = file.name.split('.').pop() || 'bin';
            const secureFileName = `${crypto.randomUUID()}.${ext}`;
            const bucket = 'form-uploads';
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            if (!supabaseUrl || !anonKey) {
                throw new Error('Supabase environment variables are missing');
            }

            const url = `${supabaseUrl}/storage/v1/object/${bucket}/${secureFileName}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'apikey': anonKey,
                    'Authorization': `Bearer ${anonKey}`,
                    'Content-Type': file.type || 'application/octet-stream',
                },
                body: file,
            });

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }
            
            // Instead of exposing the raw Supabase URL, we use our backend proxy
            const proxyUrl = `/api/storage/download/${secureFileName}`;
            onChange?.(proxyUrl);
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
            {value ? (
                <div className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 truncate">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                                <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/>
                            </svg>
                        </div>
                        <div className="truncate">
                            <p className="text-[15px] font-bold text-emerald-900 truncate">File Uploaded</p>
                            <a href={value} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline truncate block">View File</a>
                        </div>
                    </div>
                    <button type="button" onClick={() => onChange?.('')} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            ) : (
                <div className="relative border-2 border-dashed border-gray-300 bg-white rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 cursor-pointer group">
                    <input 
                        type="file" 
                        accept={field.accept || '*/*'} 
                        onChange={handleFileSelect}
                        disabled={isUploading}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                    />
                    {isUploading ? (
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-[15px] font-semibold text-gray-700">Uploading...</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                <svg className="text-gray-400 group-hover:text-gray-600 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"></path>
                                </svg>
                            </div>
                            <p className="text-[15px] font-semibold text-gray-700 mb-1">Click to upload or drag and drop</p>
                            <p className="text-xs font-medium text-gray-500">Supports {field.accept || 'all files'}</p>
                        </>
                    )}
                </div>
            )}
            {uploadError && (
                <div className="mt-3 text-sm text-red-500 font-medium flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {uploadError}
                </div>
            )}
        </div>
    );
};

export default FileUploadField;
