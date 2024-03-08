import Parser from 'web-tree-sitter';

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
