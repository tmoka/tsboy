import globals from 'globals';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: [
            'dist',
            'node_modules',
            '.husky'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        files: ['**/*.{js,ts}'],
        languageOptions: {
            ecmaVersion: 2020,
            parser: tseslint.parser,
            globals: {
                ...globals.browser,
                ...globals.node,
            }
        },
        rules: {
            'no-bitwise': 'off',
            'no-constant-condition': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            'no-console': 'off',
        }
    },

    prettierConfig,
];
