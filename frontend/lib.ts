import Parser from 'web-tree-sitter';
import treeSitterWasm from 'web-tree-sitter/tree-sitter.wasm?url';
import treeSitterFishWasm from '@esdmr/tree-sitter-fish?url';

await Parser.init({
	locateFile() {
		return treeSitterWasm;
	},
});
const fish = await Parser.Language.load(treeSitterFishWasm);

const separatorTypes = new Set([
	';',
	'&',
	'|',
	'&&',
	'||',
	'\n',
	'\r',
	'\r\n',
]);

const parser = new Parser();
parser.setLanguage(fish);

export function nonNullable<T>(i: T | null | undefined, what?: string): T {
	if (i === undefined || i === null) {
		throw new TypeError(`Assertion Error: nullish value ${what}`);
	}

   return i;
}

function getNodesAtIndex(node: Parser.SyntaxNode, targetIndex: number) {
	const cursor = node.walk();

	try {
		const nodes: Parser.SyntaxNode[] = [];
		while (true) {
			if (cursor.endIndex < targetIndex && cursor.gotoNextSibling()) continue;
			nodes.push(cursor.currentNode());
			if (!cursor.gotoFirstChild()) break;
		}
		return nodes;
	} finally {
		cursor.delete();
	}
}

export function getCompletionTargets(source: string, index: number) {
	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');

	const nodes = getNodesAtIndex(tree.rootNode, index);
	const node = nonNullable(nodes.at(-1));

	const ancestor = nodes.findLast((n) =>
		n.type === 'command' ||
		n.type === 'variable_expansion' ||
		n.type === 'file_redirect' ||
		n.type === 'stream_redirect'
	);

	const commandIndex = nodes.findLastIndex(n => n.type === 'command');
	const command = nodes[commandIndex];

	if (command) {
		let argument;

		if (
			nonNullable(ancestor).type === 'variable_expansion' && nonNullable(ancestor?.firstChild).endIndex <= index ||
			nonNullable(ancestor).type.endsWith('_redirect') && nonNullable(ancestor?.firstChild).endIndex <= index
		) {
			argument = nonNullable(ancestor).lastChild ?? undefined;
		} else {
			argument = nodes[commandIndex + 1];
		}

		return {tree, node, command, argument, error: undefined};
	}

	if (
		(
			separatorTypes.has(node.type) && node.startIndex === index ||
			node.startIndex > index
		) &&
		node.previousSibling?.type === 'command'
	) {
		return {tree, node, command: node.previousSibling, argument: undefined, error: undefined};
	}

	const error = nodes.findLast(i => i.hasError());

	return {tree, node, command: undefined, argument: undefined, error};
}
