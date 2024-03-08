import Parser from 'web-tree-sitter';
import { Range } from './tree.js';
import { endOfPairs, startOfPairs, symmetricPairs } from './types.js';
import { CompletionTarget, getCompletionTargets } from './complete.js';
import { getSource, parse } from './parse.js';

const maxCorrectionDepth = 2;

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

export function tryCorrectingError(error: Parser.SyntaxNode, index: number, correctionDepth: number): CompletionTarget | undefined {
	if (correctionDepth >= maxCorrectionDepth) return;

	const source = getSource(error.tree);
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
