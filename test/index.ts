import Parser from 'web-tree-sitter';
import {getCompletionTargets} from '../frontend/lib.js';

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function assertEquals(expected: unknown, actual: unknown, name: string) {
	assert(expected === actual, `${name}: ${JSON.stringify(expected)} ≠ ${JSON.stringify(actual)}`);
}

type NodeTestCase = {
	text?: string;
	startIndex?: number;
	endIndex?: number;
};

function assertNode(expected: NodeTestCase | undefined, actual: Parser.SyntaxNode | undefined, name: string) {
	if (expected) {
		if (expected.text !== undefined) {
			assertEquals(expected.text, actual?.text, `${name}.text`);
		}

		if (expected.startIndex !== undefined) {
			assertEquals(expected.startIndex, actual?.startIndex, `${name}.startIndex`);
		}

		if (expected.endIndex !== undefined) {
			assertEquals(expected.endIndex, actual?.endIndex, `${name}.endIndex`);
		}
	}
}

type TestCase = {
	name: string;
	input: {
		before?: string;
		after?: string;
	};
	expected: {
		command?: NodeTestCase;
		argument?: NodeTestCase;
		error?: NodeTestCase;
	};
};

function runTest(test: TestCase) {
	test.input.before ??= '';
	test.input.after ??= '';

	const actual = getCompletionTargets(test.input.before + test.input.after, test.input.before.length);

	assertNode(test.expected.command, actual.command, 'command');
	assertNode(test.expected.argument, actual.argument, 'argument');
	assertNode(test.expected.error, actual.error, 'error');
}

const tests: TestCase[] = [];

for (const test of tests) {
	try {
		runTest(test);
		console.log('PASS', test.name);
	} catch (error) {
		console.error(error);
		console.log('FAIL', test.name);
	}
}
