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

const keywordCommands = new Set([
	'begin',
	'else',
	'end',
	'for',
	'in',
	'function',
	'if',
	'switch',
	'while',
]);

const pairs = [
	['function', 'end'],
	['switch', 'end'],
	['for', 'end'],
	['while', 'end'],
	['if', 'end'],
	['begin', 'end'],
	['(', ')'],
	['[', ']'],
	['{', '}'],
	['"', '"'],
	['\'', '\''],
] as [string, string][];

const endOfPairs = new Map(pairs.map(([a, b]) => [a, b.match(/\w/) ? `\n${b}` : b]));
const startOfPairs = new Map(pairs.map(([a, b]) => [b, a.match(/\w/) ? `\n${a}` : a]));
const symmetricPairs = new Set(pairs.filter(([a, b]) => a === b).map(([a]) => a));

const parser = new Parser();
parser.setLanguage(fish);

const sources = new WeakMap<Parser.Tree, string>();
const maxCorrectionDepth = 2;

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

function* iterateChildrenOfError(error: Parser.SyntaxNode): Generator<Parser.SyntaxNode> {
	for (const child of error.children) {
		if (child.type === 'ERROR') {
			yield* iterateChildrenOfError(child);
		} else {
			yield child;
		}
	}
}

function* iterateChildrenOfErrorWithCorrection(error: Parser.SyntaxNode) {
	const pairStack: string[] = [];
	let lastIndex = error.startIndex;

	for (const {type, startIndex, endIndex} of iterateChildrenOfError(error)) {
		// Some parts of the text might be missing in the AST.
		// <https://togithub.com/tree-sitter/tree-sitter/issues/1156>
		if (startIndex !== lastIndex) {
			yield lastIndex = startIndex;
		}

		if (
			symmetricPairs.has(type)
				? pairStack.at(-1) === type
				: startOfPairs.has(type)
		) {
			while (pairStack.length > 0 && pairStack.at(-1) !== type) {
				yield pairStack.pop()!;
			}

			if (!pairStack.pop()) {
				yield startOfPairs.get(type)!;
			}
		} else if (endOfPairs.has(type)) {
			pairStack.push(endOfPairs.get(type)!);
		}

		yield lastIndex = endIndex;
	}

	if (error.endIndex !== lastIndex) {
		yield lastIndex = error.endIndex;
	}

	yield* pairStack.reverse();
}

export function parse(source: string) {
	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');
	sources.set(tree, source);
	return tree;
}

export type Range = {startIndex: number, endIndex: number};

export type CompletionTarget = (
	| {type: 'inside', command: Range, argument: Range | undefined}
	| {type: 'beside', command: Range}
	| {type: 'outside'}
	| {type: 'error', error: Range}
);

export function getCompletionTargets(tree: Parser.Tree, index: number, correctionDepth = 0): CompletionTarget {
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

	if (command && command.startIndex <= index) {
		let argument: Parser.SyntaxNode | undefined;

		if (
			(
				nonNullable(ancestor).type === 'variable_expansion' ||
				nonNullable(ancestor).type.endsWith('_redirect')
			) && nonNullable(ancestor?.firstChild).endIndex <= index
		) {
			argument = nonNullable(ancestor).lastChild ?? undefined;
		} else {
			argument = nodes[commandIndex + 1];
		}

		return {
			type: 'inside',
			command: {
				startIndex: command.startIndex,
				endIndex: command.endIndex,
			},
			argument: argument && argument.startIndex <= index ? {
				startIndex: argument.startIndex,
				endIndex: argument.endIndex,
			} : undefined,
		};
	}

	if (keywordCommands.has(node.type) && node.startIndex <= index && node.endIndex >= index) {
		return {
			type: 'inside',
			command: {
				startIndex: node.startIndex,
				endIndex: node.endIndex,
			},
			argument: {
				startIndex: node.startIndex,
				endIndex: node.endIndex,
			},
		};
	}

	if (
		(
			separatorTypes.has(node.type) && node.startIndex === index ||
			node.startIndex > index
		) &&
		node.previousSibling?.type === 'command'
	) {
		return {
			type: 'beside',
			command: {
				startIndex: node.previousSibling.startIndex,
				endIndex: node.previousSibling.endIndex,
			},
		};
	}

	if (node.startIndex > index) {
		return {type: 'outside'};
	}

	const error = nodes.findLast(i => i.type === 'ERROR');

	if (error) {
		return (
			tryCorrectingError(error, index, correctionDepth) ??
			{
				type: 'error',
				error: {
					startIndex: error.startIndex,
					endIndex: error.endIndex,
				},
			}
		);
	}

	return {type: 'outside'};
}

function tryCorrectingError(error: Parser.SyntaxNode, index: number, correctionDepth: number): CompletionTarget | undefined {
	if (correctionDepth >= maxCorrectionDepth) return;

	const source = nonNullable(sources.get(error.tree));
	const textParts: string[] = [];
	let oldIndex = error.startIndex;
	const mapping = new Map<number, number>([[-1, -oldIndex]]);
	let newIndex = oldIndex;
	let hasCorrection = false;
	index -= oldIndex;

	for (const i of iterateChildrenOfErrorWithCorrection(error)) {
		if (typeof i === 'string') {
			if (index > newIndex) index += i.length;
			textParts.push(i);
			mapping.set(newIndex, i.length);
			newIndex += i.length;
			hasCorrection = true;
		} else {
			newIndex += i - oldIndex;
			textParts.push(source.slice(oldIndex, oldIndex = i));
		}
	}

	if (!hasCorrection) return;

	const tree = parse(textParts.join(''));

	try {
		const target = getCompletionTargets(tree, index, correctionDepth + 1);

		switch (target.type) {
			case 'inside': {
				return {
					type: 'inside',
					command: {
						startIndex: mapIndex(target.command.startIndex, mapping),
						endIndex: mapIndex(target.command.endIndex, mapping),
					},
					argument: target.argument && {
						startIndex: mapIndex(target.argument.startIndex, mapping),
						endIndex: mapIndex(target.argument.endIndex, mapping),
					},
				};
			}
			case 'beside': {
				return {
					type: 'beside',
					command: {
						startIndex: mapIndex(target.command.startIndex, mapping),
						endIndex: mapIndex(target.command.endIndex, mapping),
					},
				};
			}
			case 'outside': {
				return target;
			}
			case 'error': {
				return {
					type: 'error',
					error: {
						startIndex: mapIndex(target.error.startIndex, mapping),
						endIndex: mapIndex(target.error.endIndex, mapping),
					},
				};
			}
		}
	} finally {
		tree.delete();
	}
}

function mapIndex(newIndex: number, mapping: Map<number, number>) {
	let oldIndex = newIndex;

	for (const [i, n] of mapping) {
		if (newIndex <= i && i !== -1) break;
		oldIndex -= Math.min(newIndex - i, n);
	}

	return oldIndex;
}
