/** The protocol versions /mcp speaks: 2026-07-28 without a handshake, the rest with initialize. */
export const MODERN_PROTOCOLS = ['2026-07-28'];
export const LEGACY_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SUPPORTED_PROTOCOLS = [...MODERN_PROTOCOLS, ...LEGACY_PROTOCOLS];
export const LATEST_PROTOCOL = MODERN_PROTOCOLS[0]!;
export const LATEST_LEGACY_PROTOCOL = LEGACY_PROTOCOLS[0]!;
