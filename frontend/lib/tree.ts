import Parser from 'web-tree-sitter';

export function getNodesAtIndex(node: Parser.SyntaxNode, targetIndex: number) {
	const cursor = node.walk();

	try {
		const nodes: Parser.SyntaxNode[] = [];
		while (true) {
			if (cursor.endIndex < targetIndex && cursor.gotoNextSibling()) continue;
			nodes.push(cursor.currentNode());
			if (!cursor.gotoFirstChild()) break;
		}
		return nodes;
	} finally {
		cursor.delete();
	}
}

export function getNextSibling(node_: Parser.SyntaxNode) {
	let node: Parser.SyntaxNode | null = node_;

	do {
		const {nextSibling} = node;
		if (nextSibling) return nextSibling;
		node = node.parent;
	} while (node);
}

export function getFirstLeaf(node: Parser.SyntaxNode) {
	let cursor = node.walk();

	try {
		while (cursor.gotoFirstChild());
		return cursor.currentNode();
	} finally {
		cursor.delete();
	}
}

export type Range = {startIndex: number, endIndex: number};

export function getRange(node: Range): Range {
	return {
		startIndex: node.startIndex,
		endIndex: node.endIndex,
	};
}
