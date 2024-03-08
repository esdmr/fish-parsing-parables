export function nonNullable<T>(i: T | null | undefined, what?: string): T {
	if (i === undefined || i === null) {
		throw new TypeError(`Assertion Error: nullish value ${what}`);
	}

   return i;
}
