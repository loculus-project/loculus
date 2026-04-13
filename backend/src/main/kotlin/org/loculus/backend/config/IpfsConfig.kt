package org.loculus.backend.config

/**
 * Configuration for IPFS support.
 *
 * When [enabled] is true, the backend can publish files to an IPFS node (via the Kubo-compatible
 * HTTP API at [apiUrl]) and return an IPFS gateway URL ([gatewayUrl]) so clients can retrieve the
 * content via IPFS (e.g. FASTA files attached to sequence entries).
 *
 * @param apiUrl    Base URL of the Kubo-compatible IPFS HTTP API (e.g. `http://ipfs-node:5001`).
 *                  The backend appends `/api/v0/add` to pin files.
 * @param gatewayUrl Base URL of an IPFS HTTP gateway (e.g. `https://ipfs.io` or
 *                   `https://dweb.link`). The backend appends `/ipfs/{cid}` to build
 *                   retrieval URLs.
 */
data class IpfsConfig(val enabled: Boolean = false, val apiUrl: String? = null, val gatewayUrl: String? = null)
