import { defineConfig } from 'vite';

export default defineConfig({
	cacheDir: 'node_modules/.cache/vite',
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
