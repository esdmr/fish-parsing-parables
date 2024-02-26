import Parser from 'web-tree-sitter';
import { getCompletionTargets, nonNullable } from './lib.js';

const textarea = nonNullable(document.querySelector('textarea'));
const completion = nonNullable(document.querySelector('input'));
const completionButton = nonNullable(document.querySelector('button'));
const pre = nonNullable(document.querySelector('pre'));

textarea.addEventListener('input', showCompletionTargets);
textarea.addEventListener('selectionchange', showCompletionTargets);
completionButton.addEventListener('click', completeArgument);

showCompletionTargets();

function getSource() {
	const source = textarea.value;

	const index = textarea.selectionDirection === 'forward' ? textarea.selectionEnd : textarea.selectionStart;

	return {source, index};
}

function showCompletionTargets() {
	const {source, index} = getSource();
	const {tree, node, command, argument, error} = getCompletionTargets(source, index);

	let text = '';
	text += `index:\t${encode(index)}\n`;
	text += `source:\t${encode(source.slice(0, index))}\n`;
	text += '\n';
	text += `type:\t${encode(node.type)}\n`;
	text += `node:\t${encode(source.slice(node.startIndex, Math.min(node.endIndex, index)))}\n`;
	text += `start:\t${encode(node.startIndex)}${node.startIndex > index ? ' (cursor before)' : ''}\n`;
	text += `end:\t${encode(node.endIndex)}\n`;
	text += '\n';

	if (command) {
		text += `cmd:\t${encode(source.slice(command.startIndex, Math.min(command.endIndex, index)))}\n`;
		text += `start:\t${encode(command.startIndex)}${command.startIndex > index ? ' (cursor before)' : ''}\n`;
		text += `end:\t${encode(command.endIndex)}\n`;

		if (argument) {
			const argumentText = source.slice(argument.startIndex, Math.min(argument.endIndex, index));
			completion.value = argumentText;

			text += '\n';
			text += `arg:\t${encode(argumentText)}\n`;
			text += `start:\t${encode(argument.startIndex)}${argument.startIndex > index ? ' (cursor before)' : ''}\n`;
			text += `end:\t${encode(argument.endIndex)}\n`;
		} else {
			completion.value = '';
			text += '\n\nnot in an argument\n\n';
		}
	} else if (error) {
		const errorText = source.slice(error.startIndex, Math.min(error.endIndex, index));
		completion.value = errorText;

		text += `error:\t${encode(errorText)}\n`;
		text += `start:\t${encode(error.startIndex)}${error.startIndex > index ? ' (cursor before)' : ''}\n`;
		text += `end:\t${encode(error.endIndex)}\n`;
		text += '\n\nsyntax error\n\n';
	} else {
		completion.value = '';
		text += '\n\n\nnot in a command\n\n\n\n';
	}

	text += `\ntree:\n${nodeToString(tree.rootNode)}\n`;

	pre.textContent = text.trimEnd();
	tree.delete();
}

function completeArgument(event: Event) {
	event.preventDefault();

	const {source, index} = getSource();
	const {tree, argument} = getCompletionTargets(source, index);
	const {value} = completion;

	const startIndex = Math.min(argument?.startIndex ?? source.length, index);
	const oldEndIndex = Math.max(argument?.endIndex ?? 0, index);
	const newEndIndex = startIndex + value.length;
	const pre = source.slice(0, startIndex);
	const post = source.slice(oldEndIndex);

	textarea.value = pre + value + post;
	textarea.setSelectionRange(newEndIndex, newEndIndex);
	tree.delete();
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
