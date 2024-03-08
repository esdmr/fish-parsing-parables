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

function getNextSibling(node_: Parser.SyntaxNode) {
	let node: Parser.SyntaxNode | null = node_;

	do {
		const {nextSibling} = node;
		if (nextSibling) return nextSibling;
		node = node.parent;
	} while (node);
}

function getFirstLeaf(node: Parser.SyntaxNode) {
	let cursor = node.walk();

	try {
		while (cursor.gotoFirstChild());
		return cursor.currentNode();
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

export function getRange(node: Range): Range {
	return {
		startIndex: node.startIndex,
		endIndex: node.endIndex,
	};
}

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
			command: getRange(command),
			argument: argument && argument.startIndex <= index ? getRange(argument) : undefined,
		};
	}

	if (keywordCommands.has(node.type) && node.startIndex <= index && node.endIndex >= index) {
		return {
			type: 'inside',
			command: getRange(node),
			argument: getRange(node),
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
			command: getRange(node.previousSibling),
		};
	}

	const nextSibling = getNextSibling(node);

	if (
		nextSibling &&
		nextSibling.startIndex <= index
	) {
		if (nextSibling.type === 'command') {
			const argument = nextSibling.firstChild;

			return {
				type: 'inside',
				command: getRange(nextSibling),
				argument: argument ? getRange(argument) : undefined,
			};
		}

		const nextLeaf = getFirstLeaf(nextSibling);

		if (keywordCommands.has(nextLeaf.type)) {
			return {
				type: 'inside',
				command: getRange(nextLeaf),
				argument: nextLeaf ? getRange(nextLeaf) : undefined,
			};
		}
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
				error: getRange(error),
			}
		);
	}

	return {type: 'outside'};
}

function tryCorrectingError(error: Parser.SyntaxNode, index: number, correctionDepth: number): CompletionTarget | undefined {
	if (correctionDepth >= maxCorrectionDepth) return;

	const source = nonNullable(sources.get(error.tree));
	const textParts: string[] = [];
	const {startIndex} = error;
	const mapping = new Map<number, number>([[-1, -startIndex]]);
	let oldIndex = startIndex;
	let newIndex = 0;
	let hasCorrection = false;
	index -= startIndex;

	for (const i of iterateChildrenOfErrorWithCorrection(error)) {
		if (typeof i === 'string') {
			if (index > newIndex) index += i.length;
			textParts.push(i);
			mapping.set(newIndex, i.length);
			newIndex += i.length;
			hasCorrection = true;
		} else {
			const text = source.slice(oldIndex, oldIndex = i);
			newIndex += text.length;
			textParts.push(text);
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
					command: mapRange(target.command, mapping),
					argument: target.argument && mapRange(target.argument, mapping),
				};
			}
			case 'beside': {
				return {
					type: 'beside',
					command: mapRange(target.command, mapping),
				};
			}
			case 'outside': {
				return target;
			}
			case 'error': {
				return {
					type: 'error',
					error: mapRange(target.error, mapping),
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

function mapRange(range: Range, mapping: Map<number, number>): Range {
	return {
		startIndex: mapIndex(range.startIndex, mapping),
		endIndex: mapIndex(range.endIndex, mapping),
	};
}

export function cursorToString(cursor: Parser.TreeCursor) {
	const name = cursor.currentFieldName() ?? '';
	const head = `${name ? `${name}: (` : '('}${cursor.nodeIsMissing ? 'missing ' : ''}${encode(cursor.nodeType)}[${cursor.startIndex}-${cursor.endIndex}]: ${encode(cursor.nodeText)}`;
	const children: string[] = [];

	if (cursor.gotoFirstChild()) {
		do {
			children.push(cursorToString(cursor));
		} while (cursor.gotoNextSibling());

		cursor.gotoParent();
	}

	return children.length ? `${head}\n\t${
		children.map((i) => i.replaceAll('\n', '\n\t')).join('\n\t')
	})` : `${head})`;
}

export function nodeToString(node: Parser.SyntaxNode) {
	const cursor = node.walk();

	try {
		return cursorToString(cursor);
	} finally {
		cursor.delete();
	}
}

function encode(value: unknown) {
	return typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : JSON.stringify(value);
}
