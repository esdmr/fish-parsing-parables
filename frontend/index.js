import Parser from 'web-tree-sitter';
import treeSitterWasm from 'web-tree-sitter/tree-sitter.wasm?url';
import treeSitterFishWasm from '@esdmr/tree-sitter-fish?url';

await Parser.init({
	locateFile() {
		return treeSitterWasm;
	},
});
const fish = await Parser.Language.load(treeSitterFishWasm);

const parser = new Parser();
parser.setLanguage(fish);

const textarea = nonNullable(document.querySelector('textarea'));
const pre = nonNullable(document.querySelector('pre'));

textarea.addEventListener('input', updateParseTree);
textarea.addEventListener('selectionchange', updateParseTree);

function updateParseTree() {
	let text = '';
	const source = textarea.value;

	const targetIndex = textarea.selectionStart;
	text += str`index:\t${targetIndex}\n`;
	text += str`source:\t${source.slice(0, targetIndex)}\n`;

	text += '\n';

	const tree = parser.parse(source.endsWith('\n') ? source : source + '\n');
	text += str`tree:\t${tree.rootNode}\n`;

	text += '\n';

	const node = findDescendant(tree.rootNode, targetIndex);
	text += str`type:\t${node.type}\n`;
	text += str`node:\t${source.slice(node.startIndex, targetIndex)}\n`;
	text += str`start:\t${node.startIndex}${node.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
	text += str`end:\t${node.endIndex}${node.endIndex < targetIndex ? ' (cursor after)' : ''}\n`;

	text += '\n';

	const command = findAncestor(node, 'command');

	if (command) {
		text += str`cmd:\t${source.slice(command.startIndex, targetIndex)}\n`;
		text += str`start:\t${command.startIndex}${command.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
		text += str`end:\t${command.endIndex}${command.endIndex < targetIndex ? ' (cursor after)' : ''}\n`;

		text += '\n';

		const arg = node.type === 'variable_name' ? node : findChild(command, targetIndex);
		text += str`arg:\t${source.slice(arg.startIndex, targetIndex)}\n`;
		text += str`start:\t${arg.startIndex}${arg.startIndex > targetIndex ? ' (cursor before)' : ''}\n`;
		text += str`end:\t${arg.endIndex}${arg.endIndex < targetIndex ? ' (cursor after)' : ''}\n`;
	} else {
		text += str`\nnot in a command\n\n`;
		text += '\n';

		const previousSibling = node.previousSibling;

		if (
			((node.type !== ';' && node.type !== '\n') || node.startIndex >= targetIndex) &&
			previousSibling?.type === 'command'
		) {
			console.log(previousSibling?.lastChild.text, previousSibling.text, previousSibling?.lastChild.endIndex === previousSibling.endIndex);
			text += str`cmd:\t${source.slice(previousSibling.startIndex, targetIndex)}\n`;
			text += str`start:\t${previousSibling.startIndex}\n`;
			text += str`end:\t${previousSibling.endIndex}\n`;
		} else {
			text += str`\nnot after a command\n\n`;
		}
	}

	pre.textContent = text.trimEnd();
}

function str(template, ...args) {
	return String.raw({raw: template}, ...args.map(i => typeof i === 'string' ? JSON.stringify(i).slice(1, -1) : i));
}

/**
 * @param {Parser.SyntaxNode} node
 * @param {number} targetIndex
 */
function findDescendant(node, targetIndex) {
	let isOutOfBounds;

	while ((isOutOfBounds = node.nextSibling && node.endIndex < targetIndex) || node.firstChild) {
		node = nonNullable(isOutOfBounds ? node.nextSibling : node.firstChild);
	}

	return node;
}

/**
 * @param {Parser.SyntaxNode} node
 * @param {number} targetIndex
 */
function findChild(node, targetIndex) {
	if (!node.firstChild) return node;
	node = nonNullable(node.firstChild);

	while (node.nextSibling && node.endIndex < targetIndex) {
		node = nonNullable(node.nextSibling);
	}

	return node;
}

/**
 *
 * @param {Parser.SyntaxNode} node
 * @param {string} type
 */
function findAncestor(node, type) {
	while (node.parent && node.type !== type) {
		node = node.parent;
	}

	return node.type === type ? node : undefined;
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
