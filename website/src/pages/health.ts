// Target of the Kubernetes probes: must stay independent of LAPIS, the backend and Keycloak.
export function GET() {
    return new Response('ok');
}
