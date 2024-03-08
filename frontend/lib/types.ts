export const separatorTypes = new Set([
	';',
	'&',
	'|',
	'&&',
	'||',
	'\n',
	'\r',
	'\r\n',
]);

export const keywordCommands = new Set([
	'begin',
	'else',
	'end',
	'for',
	'in',
	'function',
	'if',
	'switch',
	'case',
	'while',
	'break',
	'continue',
	'return',
	'not',
	'and',
	'or',
]);

const pairs = [
	['function', 'end'],
	['switch', 'end'],
	['for', 'end'],
	['while', 'end'],
	['if', 'end'],
	['begin', 'end'],
	['(', ')'],
	['[', ']'],
	['{', '}'],
	['"', '"'],
	['\'', '\''],
] as ReadonlyArray<readonly [string, string]>;

export const endOfPairs: ReadonlyMap<string, string> = new Map(pairs.map(([a, b]) => [a, b.match(/\w/) ? `\n${b}` : b]));
export const startOfPairs: ReadonlyMap<string, string> = new Map(pairs.map(([a, b]) => [b, a.match(/\w/) ? `${a}\n` : a]));
export const symmetricPairs: ReadonlySet<string> = new Set(pairs.filter(([a, b]) => a === b).map(([a]) => a));
