import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string = env.MONGO_URI): Promise<typeof mongoose> {
  // Some networks' default resolver can't do the SRV lookup that mongodb+srv needs.
  // DNS_SERVERS lets you point Node at a public resolver (e.g. "8.8.8.8,1.1.1.1").
  if (env.DNS_SERVERS) {
    dns.setServers(
      env.DNS_SERVERS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
