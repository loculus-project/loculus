import { getRuntimeConfig } from '../config';
import { createAuthorizationHeader } from './createAuthorizationHeader';

export type InstanceAccess = {
    canReadReleasedData: boolean;
    canContribute: boolean;
    canManageMembership: boolean;
};

// Backend is the policy authority. Never decode Keycloak roles in the website.
export async function getInstanceAccess(accessToken?: string): Promise<InstanceAccess | undefined> {
    try {
        const response = await fetch(`${getRuntimeConfig().serverSide.backendUrl}/access/capabilities`, {
            headers: createAuthorizationHeader(accessToken),
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
        });
        if (!response.ok) return undefined;
        const result = (await response.json()) as Partial<InstanceAccess>;
        if (
            typeof result.canReadReleasedData !== 'boolean' ||
            typeof result.canContribute !== 'boolean' ||
            typeof result.canManageMembership !== 'boolean'
        )
            return undefined;
        return result as InstanceAccess;
    } catch {
        return undefined;
    }
}

export function isContributionPage(pathname: string): boolean {
    return (
        /^\/[^/]+\/(submission|my_sequences|user)(\/|$)/.test(pathname) ||
        /^\/group\/[^/]+\/edit\/?$/.test(pathname) ||
        /^\/seqsets\/(create|edit)(\/|$)/.test(pathname)
    );
}
