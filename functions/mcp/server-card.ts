import { handleServerCard } from '../../server/mcp/card';

/** The MCP server card, at <streamable-http-url>/server-card as the Server Cards extension puts it. */
export const onRequest = ({ request }: { request: Request }) => handleServerCard(request);
