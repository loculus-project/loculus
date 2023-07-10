/**
 * This function breaks up a string after "maxLength" character
 */
export function splitString(s: string, maxLength: number): string[] {
    const numSubStrings = Math.ceil(s.length / maxLength);
    const splitLines: string[] = [];

    for (let i = 0; i < numSubStrings; i++) {
        const start = i * maxLength;
        const end = start + maxLength;
        splitLines.push(s.slice(start, end));
    }

    return splitLines;
}
