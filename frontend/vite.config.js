import { defineConfig } from 'vite';

function ensureTrailingSlash(url) {
	return url.endsWith('/') ? url : url + '/';
}

export default defineConfig({
	cacheDir: 'node_modules/.cache/vite',
	base: ensureTrailingSlash(
		process.env.FISH_BASE_URL ?? process.env.BASE_URL ?? '/',
	),
	build: {
		target: ['firefox104', 'chrome104'],
		outDir: 'build',
		rollupOptions: {
			input: ['index.html'],
		},
	},
	plugins: [
		{
			name: 'optimize-tree-sitter',
			transform(code, id) {
				if (!id.includes('tree-sitter.js')) return;

				return code
					.replace(/\bENVIRONMENT_IS_\w+\s*=[^=].*?,/g, '')
					.replace(/\bENVIRONMENT_IS_(?:WORKER|NODE)\s*(?!=)/g, 'false')
					.replace(/\bENVIRONMENT_IS_(?:WEB)\s*(?!=)/g, 'true')
					.replace(/\beval\b/g, '(0,eval)');
			},
		},
	],
});
