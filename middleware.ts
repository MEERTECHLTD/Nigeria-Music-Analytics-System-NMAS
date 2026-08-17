/**
 * Edge middleware: HTTP Basic Authentication for the whole deployment.
 *
 * Runs server-side at the edge BEFORE any static file is served, so it protects
 * the SPA and every /api/v1/* data artifact alike — a client-side login screen
 * would leave the JSON files publicly fetchable, which is why this is
 * middleware and not a React component.
 *
 * Credentials are read from environment variables (NMAS_USER / NMAS_PASS) so
 * they can be rotated in Vercel project settings without a code change; the
 * fallback matches the values provisioned at launch.
 */

const USER = process.env.NMAS_USER || 'NMAS';
const PASS = process.env.NMAS_PASS || 'NMAS@2024NG';

function unauthorized(): Response {
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="NMAS - National Bureau of Statistics", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export default function middleware(request: Request): Response | undefined {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const [user, ...rest] = atob(auth.slice(6)).split(':');
      if (user === USER && rest.join(':') === PASS) {
        return undefined; // authenticated - continue to the requested asset
      }
    } catch {
      // fall through to the 401
    }
  }
  return unauthorized();
}
