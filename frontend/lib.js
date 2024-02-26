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

/**
* @template T
* @param {T | null | undefined} i
* @param {string} [what]
* @returns {T}
*/
export function nonNullable(i, what) {
   if (i === undefined || i === null) {
	   throw new TypeError(`Assertion Error: nullish value ${what}`);
   }

   return i;
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
 * @param {string} source
 * @param {number} index
 */
export function getCompletionTargets(source, index) {
	const tree = parser.parse(source);

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
			argument = nonNullable(ancestor).lastChild ?? undefined;
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
