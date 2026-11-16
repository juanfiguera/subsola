import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // .claude/worktrees holds whole copies of the repo while agents work in them.
  { ignores: ['dist', 'data', '.claude', '.wrangler'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.browser } },
  { files: ['pipeline/**', '.github/scripts/**'], languageOptions: { globals: globals.node } },
  prettier,
);
