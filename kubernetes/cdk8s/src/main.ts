import { App } from 'cdk8s';
import { LoculusChart } from './chart';
import { loadValues } from './values';

// Parse CLI args: --values file1.yaml --values file2.yaml --set key=value
function parseArgs(argv: string[]): {
  valuesFiles: string[];
  sets: Record<string, string>;
  baseDir?: string;
  namespace: string;
} {
  const valuesFiles: string[] = [];
  const sets: Record<string, string> = {};
  let baseDir: string | undefined;
  let namespace = 'default';

  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--values' || argv[i] === '-f') && i + 1 < argv.length) {
      valuesFiles.push(argv[++i]);
    } else if (argv[i] === '--set' && i + 1 < argv.length) {
      const [key, ...valueParts] = argv[++i].split('=');
      sets[key] = valueParts.join('=');
    } else if (argv[i] === '--set-json' && i + 1 < argv.length) {
      const arg = argv[++i];
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.substring(0, eqIdx);
        const jsonStr = arg.substring(eqIdx + 1);
        try {
          sets[key] = JSON.parse(jsonStr);
        } catch {
          sets[key] = jsonStr;
        }
      }
    } else if (argv[i] === '--base-dir' && i + 1 < argv.length) {
      baseDir = argv[++i];
    } else if ((argv[i] === '--namespace' || argv[i] === '-n') && i + 1 < argv.length) {
      namespace = argv[++i];
    }
  }

  return { valuesFiles, sets, baseDir, namespace };
}

const args = parseArgs(process.argv.slice(2));
const values = loadValues(args);

const app = new App();
new LoculusChart(app, 'loculus', values, args.namespace);
app.synth();
