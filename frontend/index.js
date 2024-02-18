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
const pre = nonNullable(document.querySelector('pre'));

textarea.addEventListener('input', showCompletionTargets);
textarea.addEventListener('selectionchange', showCompletionTargets);
completion.addEventListener('change', completeArgument);

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
	const command = gotoAncestorOfType(cursor, 'command')?.currentNode();

	const {type} = node;

	if (command) {
		const argument = type === 'variable_name'
			? node
			: gotoChildWithIndex(cursor, index)?.currentNode() ?? node;

		return {tree, node, command, argument};
	}

	const {previousSibling} = node;

	if (
		(
			separatorTypes.has(type) && node.startIndex === index ||
			node.startIndex > index
		) &&
		previousSibling?.type === 'command'
	) {
		return {tree, node, command: previousSibling};
	}

	return {tree, node};
}

function showCompletionTargets() {
	const {source, index} = getSource();
	const {tree, node, command, argument} = getCompletionTargets(source, index);

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
			text += '\n';
			text += `arg:\t${encode(source.slice(argument.startIndex, Math.min(argument.endIndex, index)))}\n`;
			text += `start:\t${encode(argument.startIndex)}${argument.startIndex > index ? ' (cursor before)' : ''}\n`;
			text += `end:\t${encode(argument.endIndex)}\n`;
		} else {
			text += '\n\nnot in an argument\n\n';
		}
	} else {
		text += '\n\n\nnot in a command\n\n\n\n';
	}

	text += `\ntree:\n${debug(tree.rootNode.walk())}\n`;

	pre.textContent = text.trimEnd();
	tree.delete();
}

function completeArgument() {
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
 * @param {Parser.TreeCursor} node
 * @param {string} type
 */
function gotoAncestorOfType(node, type) {
	while (node.nodeType !== type && node.gotoParent());
	return node.nodeType === type ? node : undefined;
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
