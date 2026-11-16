/**
 * How to add the server in each assistant, for the docs page. Each entry was checked against the
 * client's own documentation in November 2026:
 * - Claude: https://support.claude.com/en/articles/11175166 and
 *   https://claude.com/docs/connectors/custom/add-unlisted
 * - Claude Code: https://code.claude.com/docs/en/mcp
 * - Cursor: https://cursor.com/docs/context/mcp/install-links ("JSON.stringify the configuration
 *   then base64 encode it")
 * - VS Code: https://code.visualstudio.com/docs/agents/reference/mcp-configuration; the
 *   vscode.dev install redirect was tested to hand off as vscode:mcp/install
 * - Codex: `codex mcp add --help` (codex-cli 0.147) and https://learn.chatgpt.com/docs/extend/mcp
 * - ChatGPT: https://developers.openai.com/api/docs/guides/custom-mcp-server
 * - Windsurf, now Devin Desktop: https://docs.devin.ai/windsurf/plugins/cascade/mcp
 */

export const MCP_URL = 'https://subsola.com/mcp';

export interface Snippet {
  label: string;
  text: string;
}

export interface ClientSetup {
  id: string;
  name: string;
  /** On the client picker's tab. */
  short: string;
  /** Plain sentences, with `backticks` around code; the page escapes them. */
  steps: string[];
  /** A line under the steps for the exceptions. */
  note?: string;
  snippets: Snippet[];
  /** A one-click install link, where the client has one. */
  install?: { label: string; href: string };
}

const CURSOR_CONFIG = btoa(JSON.stringify({ url: MCP_URL }));
const VSCODE_CONFIG = encodeURIComponent(JSON.stringify({ type: 'http', url: MCP_URL }));

export const CLAUDE_CODE_COMMAND = `claude mcp add --transport http subsola ${MCP_URL}`;

export const CLIENTS: ClientSetup[] = [
  {
    id: 'claude',
    short: 'Claude',
    name: 'Claude (claude.ai and the desktop app)',
    steps: [
      'Open Customize, then Connectors.',
      'Choose Add, then Add custom connector.',
      'Name it Subsola, paste the server URL, and choose Continue.',
      'For sign-in, choose No sign-in, then Add.',
    ],
    note: 'On Team and Enterprise plans an owner adds it under Organization settings, Connectors, and members connect it. The free plan allows one custom connector.',
    snippets: [{ label: 'Server URL', text: MCP_URL }],
  },
  {
    id: 'claude-code',
    short: 'Claude Code',
    name: 'Claude Code',
    steps: [
      'Run this in a terminal. Add `--scope user` to have it in every project. Check it with `/mcp` in a session.',
    ],
    snippets: [{ label: 'Command', text: CLAUDE_CODE_COMMAND }],
  },
  {
    id: 'cursor',
    short: 'Cursor',
    name: 'Cursor',
    steps: [
      'Install with one click, or add the server to `.cursor/mcp.json` in a project (`~/.cursor/mcp.json` for every project).',
    ],
    install: {
      label: 'Add to Cursor',
      href: `cursor://anysphere.cursor-deeplink/mcp/install?name=subsola&config=${CURSOR_CONFIG}`,
    },
    snippets: [
      {
        label: 'mcp.json',
        text: JSON.stringify({ mcpServers: { subsola: { url: MCP_URL } } }, null, 2),
      },
    ],
  },
  {
    id: 'vscode',
    short: 'VS Code',
    name: 'VS Code',
    steps: [
      'Install with one click, run the command, or add the server to `.vscode/mcp.json` in a workspace.',
    ],
    install: {
      label: 'Add to VS Code',
      href: `https://vscode.dev/redirect/mcp/install?name=subsola&config=${VSCODE_CONFIG}`,
    },
    snippets: [
      {
        label: 'Command',
        text: `code --add-mcp '${JSON.stringify({ name: 'subsola', type: 'http', url: MCP_URL })}'`,
      },
      {
        label: '.vscode/mcp.json',
        text: JSON.stringify({ servers: { subsola: { type: 'http', url: MCP_URL } } }, null, 2),
      },
    ],
  },
  {
    id: 'codex',
    short: 'Codex',
    name: 'OpenAI Codex',
    steps: ['Run this in a terminal, or add the table to `~/.codex/config.toml`.'],
    snippets: [
      { label: 'Command', text: `codex mcp add subsola --url ${MCP_URL}` },
      { label: 'config.toml', text: `[mcp_servers.subsola]\nurl = "${MCP_URL}"` },
    ],
  },
  {
    id: 'chatgpt',
    short: 'ChatGPT',
    name: 'ChatGPT',
    steps: [
      'On the web, go to `chatgpt.com/plugins`, choose the plus button, then Add custom MCP server.',
      'Under Connection, paste the server URL. For authentication, choose No authentication.',
      'Confirm, then choose Create as a plugin.',
    ],
    note: 'Which plans can add custom servers is set by OpenAI and your workspace.',
    snippets: [{ label: 'Server URL', text: MCP_URL }],
  },
  {
    id: 'windsurf',
    short: 'Windsurf',
    name: 'Windsurf (Devin Desktop)',
    steps: [
      'Add the server to `~/.config/devin/mcp_config.json` (older installs: `~/.codeium/windsurf/mcp_config.json`).',
    ],
    snippets: [
      {
        label: 'mcp_config.json',
        text: JSON.stringify({ mcpServers: { subsola: { serverUrl: MCP_URL } } }, null, 2),
      },
    ],
  },
  {
    id: 'other',
    short: 'Other',
    name: 'Any client that supports Streamable HTTP',
    steps: [
      'Point it at the server URL. There is no sign-in, no key and no session to keep: each request stands alone.',
    ],
    snippets: [{ label: 'Server URL', text: MCP_URL }],
  },
];
