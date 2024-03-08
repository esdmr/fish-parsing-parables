import Parser from 'web-tree-sitter';
import { Range, getFirstLeaf, getNextSibling, getNodesAtIndex, getRange } from './tree.js';
import { nonNullable } from './utils.js';
import { keywordCommands, separatorTypes } from './types.js';
import { tryCorrectingError } from './error.js';

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
