/**
 * local server entry file, for local development
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import app from './app.js';
import { connectDatabase } from './models/index.js';
import { startRemotePhotoRetentionJob } from './services/RemotePhotoRetentionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPathCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

const envPath = envPathCandidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
}

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await connectDatabase();
    const remotePhotoRetentionJob = startRemotePhotoRetentionJob();

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
      const startedServer = app.listen(PORT, () => {
        console.log(`Server ready on port ${PORT}`);
        resolve(startedServer);
      });

      startedServer.once('error', reject);
    });

    /**
     * close server
     */
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received');
      remotePhotoRetentionJob.stop();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received');
      remotePhotoRetentionJob.stop();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
      console.error(`A porta ${PORT} já está em uso. Finalize a instância anterior do backend e tente novamente.`);
      process.exit(1);
    }

    console.error('Erro ao iniciar o backend:', error);
    process.exit(1);
  }
};

startServer();

export default app;
