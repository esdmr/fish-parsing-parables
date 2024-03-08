import Parser from 'web-tree-sitter';
import treeSitterWasm from 'web-tree-sitter/tree-sitter.wasm?url';
import treeSitterFishWasm from '@esdmr/tree-sitter-fish?url';
import { nonNullable } from './utils.js';

await Parser.init({
	locateFile() {
		return treeSitterWasm;
	},
});
const fish = await Parser.Language.load(treeSitterFishWasm);

const parser = new Parser();
parser.setLanguage(fish);

const sources = new WeakMap<Parser.Tree, string>();

export function parse(source: string) {
	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');
	sources.set(tree, source);
	return tree;
}

export function getSource(tree: Parser.Tree) {
	return nonNullable(sources.get(tree));
}
