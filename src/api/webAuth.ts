import { encodeBase64 } from './encryption';
import { configuration } from '@/configuration';

/**
 * Generate a URL for web authentication
 * @param publicKey - The ephemeral public key to include in the URL
 * @returns The web authentication URL
 */
export function generateWebAuthUrl(publicKey: Uint8Array): string {
    const publicKeyBase64 = encodeBase64(publicKey, 'base64url');
    
    // Use local web UI if server is localhost, otherwise use official web UI
    if (configuration.serverUrl.includes('localhost') || configuration.serverUrl.includes('127.0.0.1')) {
        const webUrl = configuration.serverUrl.replace(/:\d+$/, ':8082');
        return `${webUrl}/terminal/connect#key=${publicKeyBase64}`;
    }
    
    return `https://app.happy.engineering/terminal/connect#key=${publicKeyBase64}`;
}