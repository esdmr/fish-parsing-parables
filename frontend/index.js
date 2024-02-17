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
const pre = nonNullable(document.querySelector('pre'));

textarea.addEventListener('input', showCompletionTargets);
textarea.addEventListener('selectionchange', showCompletionTargets);

showCompletionTargets();

/**
 * @param {string} source
 * @param {number} targetIndex
 */
function getCompletionTargets(source, targetIndex) {
	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');

	const cursor = tree.rootNode.walk();
	const node = gotoDescendantWithIndex(cursor, targetIndex).currentNode();
	const command = gotoAncestorOfType(cursor, 'command')?.currentNode();

	const {type} = node;

	if (command) {
		const argument = type === 'variable_name'
			? node
			: gotoChildWithIndex(cursor, targetIndex)?.currentNode() ?? node;

		return {tree, node, command, argument};
	}

	const {previousSibling} = node;

	if (
		(
			separatorTypes.has(type) && node.startIndex === targetIndex ||
			node.startIndex > targetIndex
		) &&
		previousSibling?.type === 'command'
	) {
		return {tree, node, command: previousSibling};
	}

	return {tree, node};
}

function showCompletionTargets() {
	const source = textarea.value;

	const targetIndex = textarea.selectionDirection === 'forward' ? textarea.selectionEnd : textarea.selectionStart;

	const {tree, node, command, argument} = getCompletionTargets(source, targetIndex);

	let text = '';
	text += `index:\t${encode(targetIndex)}\n`;
	text += `source:\t${encode(source.slice(0, targetIndex))}\n`;
	text += '\n';
	text += `type:\t${encode(node.type)}\n`;
	text += `node:\t${encode(source.slice(node.startIndex, Math.min(node.endIndex, targetIndex)))}\n`;
	text += `start:\t${encode(node.startIndex)}${node.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
	text += `end:\t${encode(node.endIndex)}\n`;
	text += '\n';

	if (command) {
		text += `cmd:\t${encode(source.slice(command.startIndex, Math.min(command.endIndex, targetIndex)))}\n`;
		text += `start:\t${encode(command.startIndex)}${command.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
		text += `end:\t${encode(command.endIndex)}\n`;

		if (argument) {
			text += '\n';
			text += `arg:\t${encode(source.slice(argument.startIndex, Math.min(argument.endIndex, targetIndex)))}\n`;
			text += `start:\t${encode(argument.startIndex)}${argument.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
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

/**
 * @param {Parser.TreeCursor} cursor
 */
function debug(cursor) {
	const name = cursor.currentFieldName() ?? '';
	const head = `${name ? `${name}, ` : ''}${encode(cursor.nodeType)}[${cursor.startIndex}-${cursor.endIndex}]`;
	const children = [];

	if (cursor.gotoFirstChild()) {
		do {
			children.push(debug(cursor));
		} while (cursor.gotoNextSibling());

		cursor.gotoParent();
	}

	return children.length ? `(${head}\n\t${
		children.map((i) => i.replaceAll('\n', '\n\t')).join('\n\t')
	})` : `(${head}: ${encode(cursor.nodeText)})`;
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
