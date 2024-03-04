import Parser from 'web-tree-sitter';
import { getCompletionTargets, nonNullable, parse } from './lib.js';

const textarea = nonNullable(document.querySelector('textarea'));
const inputCompletion = nonNullable(document.querySelector<HTMLInputElement>('#completion'));
const inputFrom = nonNullable(document.querySelector<HTMLInputElement>('#from'));
const inputTo = nonNullable(document.querySelector<HTMLInputElement>('#to'));
const buttonComplete = nonNullable(document.querySelector('button'));
const pre = nonNullable(document.querySelector('pre'));

textarea.addEventListener('input', showCompletionTargets);
textarea.addEventListener('selectionchange', showCompletionTargets);
buttonComplete.addEventListener('click', completeArgument);

showCompletionTargets();

function getSource() {
	const source = textarea.value;

	const index = textarea.selectionDirection === 'forward' ? textarea.selectionEnd : textarea.selectionStart;

	return {source, index};
}

function showCompletionTargets() {
	const {source, index} = getSource();
	const tree = parse(source);

	try {
		const target = getCompletionTargets(tree, index);
		pre.textContent = `${JSON.stringify(target, null, '\t')}\n\n${nodeToString(tree.rootNode)}`;

		if (target.type === 'error') {
			inputCompletion.value = '';
			inputFrom.value = String(target.error.startIndex);
		} else if (target.type === 'inside' && target.argument) {
			inputCompletion.value = source.slice(
				Math.min(target.argument.startIndex, index),
				Math.min(target.argument.endIndex, index),
			);
			inputFrom.value = String(Math.min(target.argument.startIndex, index));
			inputTo.value = String(Math.max(target.argument.endIndex, index));
		} else {
			inputCompletion.value = '';
			inputFrom.value = String(index);
			inputTo.value = String(index);
		}
	} finally {
		tree.delete();
	}
}

function completeArgument(event: Event) {
	event.preventDefault();

	const {source} = getSource();
	const {value} = inputCompletion;

	const startIndex = inputFrom.valueAsNumber;
	const oldEndIndex = inputTo.valueAsNumber;
	const newEndIndex = startIndex + value.length;
	const pre = source.slice(0, startIndex);
	const post = source.slice(oldEndIndex);

	textarea.value = pre + value + post;
	textarea.setSelectionRange(newEndIndex, newEndIndex);
	showCompletionTargets();
}

function cursorToString(cursor: Parser.TreeCursor) {
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

function nodeToString(node: Parser.SyntaxNode) {
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
