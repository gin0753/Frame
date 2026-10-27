import { isIP } from 'node:net';
export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv))
    throw new Error('Invalid NODE_ENV');
  const rawPort = env.PORT ?? '3001';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
    throw new Error('Invalid PORT');
  const host = env.HOST ?? '127.0.0.1';
  if (!(isIP(host) || host === 'localhost'))
    throw new Error('HOST must be an IP address or localhost');
  return Object.freeze({ nodeEnv, port: Number(rawPort), host });
}
