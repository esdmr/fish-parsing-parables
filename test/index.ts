import {CompletionTarget, getCompletionTargets, parse} from '../frontend/lib.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

type TestCase = {
	name: string;
	input: {
		source?: string;
		index?: number;
	};
	expected: CompletionTarget;
};

function runTest({name, input, expected}: TestCase) {
	input.source ??= '';
	input.index ??= input.source.length;

	const tree = parse(input.source);

	try {
		const actual = getCompletionTargets(tree, input.index);
		assert.deepEqual(actual, expected);
	} finally {
		tree.delete();
	}
}

const tests: TestCase[] = [];

const file = await fs.readFile(new URL('../test-cases.txt', import.meta.url), 'utf8');

for (const line of file.split('\n').values()) {
	if (line.startsWith('#') || !line.trim()) continue;

	const match = line.match(/^\s*(?<name>\w+)\s*#(?<kind>[<=>?])\s(?<content>.+)$/);

	if (!match) {
		throw new Error(`Invalid test case: ${line}`);
	}

	const {name, kind, content} = match.groups!;
	let source = '';
	let index: number | undefined;
	let commandStartIndex: number | undefined;
	let commandEndIndex: number | undefined;
	let argumentStartIndex: number | undefined;
	let argumentEndIndex: number | undefined;

	for (let i of content.matchAll(/#.|.|#$/g)) {
		switch (i[0]) {
			case '##': {
				source += '#';
				break;
			}

			case '#|': {
				index = source.length;
				break;
			}

			case '#(': {
				commandStartIndex = source.length;
				break;
			}

			case '#)': {
				commandEndIndex = source.length;
				break;
			}

			case '#[': {
				argumentStartIndex = source.length;
				break;
			}

			case '#]': {
				argumentEndIndex = source.length;
				break;
			}

			case '#\\': {
				source += '\n';
				break;
			}

			case '#&': {
				source += '\t';
				break;
			}

			case '#': {
				break;
			}

			default: {
				if (i[0].length > 1) {
					throw new Error(`Invalid test case item ${i[0]}: ${line}`);
				}

				source += i[0];
			}
		}
	}

	switch (kind) {
		case '<': {
			tests.push({
				name,
				input: {
					source,
					index,
				},
				expected: {
					type: 'outside',
				},
			});
			break;
		}

		case '=': {
			assert.notEqual(commandStartIndex, undefined, `Command start must be defined in ${name}`);
			assert.notEqual(commandEndIndex, undefined, `Unmatched command delimiter in ${name}`);
			assert.equal(argumentStartIndex === undefined, argumentEndIndex === undefined, `Unmatched argument delimiter in ${name}`);

			tests.push({
				name,
				input: {
					source,
					index,
				},
				expected: {
					type: 'inside',
					command: {
						startIndex: commandStartIndex!,
						endIndex: commandEndIndex!,
					},
					argument: argumentStartIndex === undefined ? undefined : {
						startIndex: argumentStartIndex!,
						endIndex: argumentEndIndex!,
					},
				},
			});
			break;
		}

		case '>': {
			assert.notEqual(commandStartIndex, undefined, `Command start must be defined in ${name}`);
			assert.notEqual(commandEndIndex, undefined, `Unmatched command delimiter in ${name}`);

			tests.push({
				name,
				input: {
					source,
					index,
				},
				expected: {
					type: 'beside',
					command: {
						startIndex: commandStartIndex!,
						endIndex: commandEndIndex!,
					},
				},
			});
			break;
		}

		case '?': {
			assert.notEqual(commandStartIndex, undefined, `Error start must be defined in ${name}`);
			assert.notEqual(commandEndIndex, undefined, `Unmatched error delimiter in ${name}`);

			tests.push({
				name,
				input: {
					source,
					index,
				},
				expected: {
					type: 'error',
					error: {
						startIndex: commandStartIndex!,
						endIndex: commandEndIndex!,
					},
				},
			});
			break;
		}
	}
}

for (const test of tests) {
	try {
		runTest(test);
		console.log('PASS', test.name);
	} catch (error) {
		console.error('ERROR', test.name, error);
		console.log('FAIL', test.name);
	}
}
