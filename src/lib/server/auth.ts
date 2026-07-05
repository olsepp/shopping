import { SignJWT, jwtVerify } from 'jose';
import { compare, hash } from 'bcryptjs';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'HS256';
const EXPIRY = '30d';

let _secret: Uint8Array | null = null;
function getSecret() {
	if (_secret) return _secret;
	if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is required');
	_secret = new TextEncoder().encode(env.SESSION_SECRET);
	return _secret;
}

export interface SessionPayload {
	userId: number;
	username: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: ALGORITHM })
		.setIssuedAt()
		.setExpirationTime(EXPIRY)
		.sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
	try {
		const { payload } = await jwtVerify(token, getSecret());
		return { userId: payload.userId as number, username: payload.username as string };
	} catch {
		return null;
	}
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return compare(password, hash);
}

export async function hashPassword(password: string): Promise<string> {
	return hash(password, 10);
}
