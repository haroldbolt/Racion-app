import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const firebaseKeys = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

export async function firebaseAccount(token: string, project: string, keys: JWTVerifyGetKey = firebaseKeys): Promise<string> {
  const {payload, protectedHeader} = await jwtVerify(token, keys, {
    algorithms:['RS256'], issuer:'https://securetoken.google.com/' + project, audience:project,
    requiredClaims:['sub', 'iat', 'exp', 'auth_time'], maxTokenAge:'1h',
  });
  const uid = payload.sub;
  const authTime = payload.auth_time;
  const firebase = payload.firebase as { sign_in_provider?: string; tenant?: string } | undefined;
  if (!protectedHeader.kid || !uid || uid.length > 128 || typeof authTime !== 'number' ||
      authTime > Math.floor(Date.now() / 1000) || firebase?.tenant ||
      !['password', 'google.com'].includes(firebase?.sign_in_provider ?? '')) throw new Error('invalid_identity');
  return uid;
}
