import {defaultImport} from 'default-import';
import {defineConfig} from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import esbuild from 'rollup-plugin-esbuild';

export default defineConfig({
	input: 'index.ts',
	output: {
		dir: 'build',
		format: 'es',
	},
	plugins: [
		defaultImport(esbuild)({
			target: 'esnext',
		}),
		defaultImport(commonjs)({
			extensions: ['.js', '.mjs', '.json', '.ts', '.mts', '**/*.wasm'],
		}),
		defaultImport(nodeResolve)({
			extensions: ['.js', '.mjs', '.json', '.ts', '.mts', '**/*.wasm'],
		}),
		defaultImport(url)({
			include: ['**/*.wasm'],
			limit: 0,
			publicPath: new URL('build/', import.meta.url).pathname,
			fileName: '[name][extname]',
		}),
		{
			name: 'url-imports',
			resolveId(source, importer, options) {
				if (!source.endsWith('?url')) return;
				return this.resolve(source.slice(0, -4), importer, {
					...options,
					skipSelf: true,
				});
			},
		},
		{
			name: 'web-tree-sitter',
			transform(code, id) {
				if (!id.includes('tree-sitter.js')) return;
				return `
					const {pathname: __dirname} = /* @__PURE__ */ new (0, URL)('.', import.meta.url);
					${code.replace(/\beval\b/g, '(0,eval)')}
				`;
			}
		},
	],
});
