import 'server-only';
import { apiOrigin } from '../../../config/api-origin';
export async function getApiHealth() {
  const origin = apiOrigin(process.env.FRAME_API_ORIGIN);
  if (!origin)
    throw new Error('FRAME_API_ORIGIN is required for server API requests.');
  try {
    const response = await fetch(`${origin}/api/v1/health`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    )
      throw new Error();
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('status' in body) ||
      !('service' in body) ||
      body.status !== 'ok' ||
      body.service !== 'frame-api'
    )
      throw new Error();
    return { status: body.status, service: body.service };
  } catch {
    throw new Error('FRAME API unavailable or invalid response.');
  }
}
