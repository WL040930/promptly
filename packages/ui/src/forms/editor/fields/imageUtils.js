/**
 * imageUtils.js — Image compression utilities for file upload fields.
 */

/**
 * Compresses an image file to max 1920×1080 at 80% JPEG quality.
 * Non-image files and GIFs are returned unchanged.
 *
 * @param {File} file - The file to compress.
 * @returns {Promise<File>} The compressed (or original) file.
 */
export const compressImage = (file) =>
    new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') {
            return resolve(file);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onerror = () => resolve(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onerror = () => resolve(file);

            img.onload = () => {
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;
                let { width, height } = img;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })),
                    'image/jpeg',
                    0.8,
                );
            };
        };
    });
