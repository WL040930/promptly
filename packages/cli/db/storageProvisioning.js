export const ensureStorageResources = async sequelize => {
    try {
        await sequelize.query(`
            INSERT INTO storage.buckets (id, name, public)
            VALUES ('workflow-assets', 'workflow-assets', false)
            ON CONFLICT (id) DO NOTHING;
        `);
        await sequelize.query(`
            INSERT INTO storage.buckets (id, name, public)
            VALUES ('form-uploads', 'form-uploads', true)
            ON CONFLICT (id) DO NOTHING;
        `);
        await sequelize.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'storage'
                  AND tablename = 'objects'
                  AND policyname = 'Allow public uploads to form-uploads'
              ) THEN
                CREATE POLICY "Allow public uploads to form-uploads"
                ON storage.objects FOR INSERT TO public
                WITH CHECK (bucket_id = 'form-uploads');
              END IF;
            END
            $$;
        `);
        console.log('[DB] Storage resources provisioned.');
    } catch (error) {
        console.warn('[DB] Storage resources were not provisioned. Configure Supabase storage separately if it is required.', error.message);
    }
};
