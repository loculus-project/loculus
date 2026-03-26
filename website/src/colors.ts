import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { mainTailwindColor } = require('../colors.cjs') as {
    mainTailwindColor: Record<number, string>;
};

export { mainTailwindColor };
