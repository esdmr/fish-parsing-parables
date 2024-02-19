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

/**
 * @param {string} source
 * @param {number} index
 */
function getCompletionTargets(source, index) {
	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');

	const cursor = tree.rootNode.walk();
	const node = gotoDescendantWithIndex(cursor, index).currentNode();

	const ancestor = gotoAncestor(cursor, (c) =>
		c.nodeType === 'command' ||
		c.nodeType === 'variable_expansion' ||
		c.nodeType === 'file_redirect' ||
		c.nodeType === 'stream_redirect'
	)?.currentNode();

	const command = gotoAncestor(cursor, (c) => c.nodeType === 'command')?.currentNode();

	if (command) {
		let argument;

		if (
			nonNullable(ancestor).type === 'variable_expansion' && nonNullable(ancestor?.firstChild).endIndex <= index ||
			nonNullable(ancestor).type.endsWith('_redirect') && nonNullable(ancestor?.firstChild).endIndex <= index
		) {
			argument = nonNullable(ancestor).lastChild;
		} else {
			argument = gotoChildWithIndex(cursor, index)?.currentNode();
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

	const error = findErrorRoot(node);

	return {tree, node, command: undefined, argument: undefined, error};
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
			const argumentText = encode(source.slice(argument.startIndex, Math.min(argument.endIndex, index)));
			completion.value = argumentText;

			text += '\n';
			text += `arg:\t${argumentText}\n`;
			text += `start:\t${encode(argument.startIndex)}${argument.startIndex > index ? ' (cursor before)' : ''}\n`;
			text += `end:\t${encode(argument.endIndex)}\n`;
		} else {
			completion.value = '';
			text += '\n\nnot in an argument\n\n';
		}
	} else if (error) {
		const errorText = encode(source.slice(error.startIndex, Math.min(error.endIndex, index)));
		completion.value = errorText;

		text += `error:\t${errorText}\n`;
		text += `start:\t${encode(error.startIndex)}${error.startIndex > index ? ' (cursor before)' : ''}\n`;
		text += `end:\t${encode(error.endIndex)}\n`;
		text += '\n\nsyntax error\n\n';
	} else {
		completion.value = '';
		text += '\n\n\nnot in a command\n\n\n\n';
	}

	text += `\ntree:\n${debug(tree.rootNode.walk())}\n`;

	pre.textContent = text.trimEnd();
	tree.delete();
}

function completeArgument(event) {
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

/**
 * @param {Parser.TreeCursor} cursor
 */
function debug(cursor) {
	const name = cursor.currentFieldName() ?? '';
	const head = `${name ? `${name}, ` : ''}${encode(cursor.nodeType)}[${cursor.startIndex}-${cursor.endIndex}]: ${encode(cursor.nodeText)}`;
	const children = [];

	if (cursor.gotoFirstChild()) {
		do {
			children.push(debug(cursor));
		} while (cursor.gotoNextSibling());

		cursor.gotoParent();
	}

	return children.length ? `(${head}\n\t${
		children.map((i) => i.replaceAll('\n', '\n\t')).join('\n\t')
	})` : `(${head})`;
}

function encode(value) {
	return typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : value;
}

/**
 * @param {Parser.TreeCursor} cursor
 * @param {number} targetIndex
 */
function gotoDescendantWithIndex(cursor, targetIndex) {
	while (
		cursor.endIndex < targetIndex && cursor.gotoNextSibling() ||
		cursor.gotoFirstChild()
	);
	return cursor;
}

/**
 * @param {Parser.TreeCursor} cursor
 * @param {number} targetIndex
 */
function gotoChildWithIndex(cursor, targetIndex) {
	if (!cursor.gotoFirstChild()) return;
	while (cursor.endIndex < targetIndex && cursor.gotoNextSibling());
	return cursor;
}

/**
 * @param {Parser.TreeCursor} cursor
 * @param {(cursor: Parser.TreeCursor) => boolean} fn
 */
function gotoAncestor(cursor, fn) {
	while (!fn(cursor) && cursor.gotoParent());
	return fn(cursor) ? cursor : undefined;
}

/**
 * @param {Parser.SyntaxNode} node
 */
function findErrorRoot(node) {
	while (!node.hasError() && node.parent) {
		node = node.parent;
	}

	return node.hasError() ? node : undefined;
}

/**
 * @template T
 * @param {T | null | undefined} i
 * @param {string} [what]
 * @returns {T}
 */
function nonNullable(i, what) {
	if (i === undefined || i === null) {
		throw new TypeError(`Assertion Error: nullish value ${what}`);
	}

	return i;
}
