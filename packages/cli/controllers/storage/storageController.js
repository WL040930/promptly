import { Buffer } from 'buffer';
import env from '../../config/env.js';

export const downloadFile = async (req, res) => {
    const { filename } = req.params;
    if (!filename) {
        return res.status(400).json({ message: 'Filename is required' });
    }

    try {
        const bucket = 'form-uploads';
        const supabaseUrl = env.supabase.url; 
        
        if (!supabaseUrl) {
           return res.status(500).json({ message: 'Storage not configured on server' });
        }

        const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Supabase returned ${response.status} for ${filename}`);
            return res.status(response.status).send('File not found or access denied');
        }

        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        
        const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

        // Use arrayBuffer to send the response because fetch body.pipe is not always standard across Node versions
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
        
    } catch (error) {
        console.error('Storage Proxy Error:', error);
        res.status(500).json({ message: 'Internal server error while fetching file' });
    }
};

export const uploadFile = async (req, res) => {
    const { filename } = req.params;
    if (!filename) {
        return res.status(400).json({ message: 'Filename is required' });
    }

    try {
        const bucket = 'form-uploads';
        const supabaseUrl = env.supabase.url; 
        const anonKey = env.supabase.anonKey;
        
        if (!supabaseUrl || !anonKey) {
           return res.status(500).json({ message: 'Storage not configured on server' });
        }

        const url = `${supabaseUrl}/storage/v1/object/${bucket}/${filename}`;
        const contentType = req.headers['content-type'] || 'application/octet-stream';
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`,
                'Content-Type': contentType,
            },
            body: req.body, // The raw binary buffer captured by express.raw
        });
        
        if (!response.ok) {
            console.error(`Supabase returned ${response.status} for upload of ${filename}`);
            const errorText = await response.text();
            return res.status(response.status).json({ message: 'Upload failed to storage', details: errorText });
        }

        const data = await response.json();
        res.status(200).json(data);
        
    } catch (error) {
        console.error('Storage Upload Proxy Error:', error);
        res.status(500).json({ message: 'Internal server error while uploading file' });
    }
};
