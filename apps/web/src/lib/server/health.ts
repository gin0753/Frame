import 'server-only';
import { healthResponseSchema } from '@frame/contracts';
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
    return healthResponseSchema.parse(body);
  } catch {
    throw new Error('FRAME API unavailable or invalid response.');
  }
}
