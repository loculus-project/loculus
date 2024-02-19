export class AccessionTransformer {
    private static readonly CODE_POINTS: string = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    private readonly accessionPrefix: string;

    constructor(accessionPrefix: string) {
        this.accessionPrefix = accessionPrefix;
    }

    public generateCustomIds(sequenceNumbers: number[]): string[] {
        return sequenceNumbers.map(this.generateCustomId.bind(this));
    }

    public generateCustomId(sequenceNumber: number): string {
        const base34Digits: string[] = [];
        let remainder: number = sequenceNumber;

        do {
            const digit: number = remainder % 34;
            base34Digits.push(AccessionTransformer.CODE_POINTS[digit]);
            remainder = Math.floor(remainder / 34);
        } while (remainder > 0);

        while (base34Digits.length < 6) {
            base34Digits.push('0');
        }

        const serialAccessionPart: string = base34Digits.reverse().join('');
        return this.accessionPrefix + serialAccessionPart + this.generateCheckCharacter(serialAccessionPart);
    }

    public validateAccession(accession: string): boolean {
        if (!accession.startsWith(this.accessionPrefix)) {
            return false;
        }
        return this.validateCheckCharacter(accession.substring(this.accessionPrefix.length));
    }

    private generateCheckCharacter(input: string): string {
        let factor: number = 2;
        let sum: number = 0;
        const numberOfValidInputCharacters: number = AccessionTransformer.CODE_POINTS.length;

        for (let i: number = input.length - 1; i >= 0; i--) {
            let addend: number = factor * this.getCodePointFromCharacter(input[i]);

            factor = factor === 2 ? 1 : 2;

            addend = Math.floor(addend / numberOfValidInputCharacters) + (addend % numberOfValidInputCharacters);
            sum += addend;
        }

        const remainder: number = sum % numberOfValidInputCharacters;
        const checkCodePoint: number = (numberOfValidInputCharacters - remainder) % numberOfValidInputCharacters;
        return AccessionTransformer.CODE_POINTS.charAt(checkCodePoint);
    }

    private validateCheckCharacter(input: string): boolean {
        let factor: number = 1;
        let sum: number = 0;
        const numberOfValidInputCharacters: number = AccessionTransformer.CODE_POINTS.length;

        for (let i: number = input.length - 1; i >= 0; i--) {
            const codePoint: number = this.getCodePointFromCharacter(input[i]);
            let addend: number = factor * codePoint;

            factor = factor === 2 ? 1 : 2;

            addend = Math.floor(addend / numberOfValidInputCharacters) + (addend % numberOfValidInputCharacters);
            sum += addend;
        }

        const remainder: number = sum % numberOfValidInputCharacters;
        return remainder === 0;
    }

    private getCodePointFromCharacter(character: string): number {
        return AccessionTransformer.CODE_POINTS.indexOf(character);
    }
}
