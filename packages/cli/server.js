import app from './app.js';
import sequelize from './db/index.js';
import env from './config/env.js';
import './models/index.js';
import NodeRegistry from './utils/NodeRegistry.js';

const startServer = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    
    // Initialize the dynamic node registry
    await NodeRegistry.init();
    
    // Auto-initialize the 'form-uploads' bucket if it doesn't exist
    try {
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
            CREATE POLICY "Allow public uploads to form-uploads" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'form-uploads');
          END IF;
        END
        $$;
      `);
      console.log('✅ Storage bucket auto-initialized');
    } catch (err) {
      console.log('⚠️ Could not auto-initialize storage bucket (ignore if not using Supabase storage or missing permissions)', err.message);
    }

    app.listen(env.app.port, () => {
      console.log(`🚀 Server running on http://localhost:${env.app.port}`);
      console.log(`📚 API Health: http://localhost:${env.app.port}/api/health`);
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

startServer();