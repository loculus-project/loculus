const fs = require('fs');
const jsYaml = require('js-yaml');
const { generateConfig } = require('./src/generateConfig');
const path = require('path');

const args = require('minimist')(process.argv.slice(2));

const inputFile = args.inputFile;
if (inputFile === undefined) {
    throw new Error('You must specify an input file with --inputFile');
}

const outputDir = args.outputDir;
if (outputDir === undefined) {
    throw new Error('You must specify an output directory with --outputDir');
}

const inputConfig = jsYaml.load(fs.readFileSync(inputFile, 'utf8'));

const { backend, website, lapis } = generateConfig(inputConfig);

const backendConfigFile = path.join(outputDir, 'backend_config.json');
const websiteConfigFile = path.join(outputDir, 'website_config.json');
const lapisSiloConfigFile = path.join(outputDir, 'database_config.yaml');

fs.writeFileSync(backendConfigFile, JSON.stringify(backend, null, 4));
fs.writeFileSync(websiteConfigFile, JSON.stringify(website, null, 4));
fs.writeFileSync(lapisSiloConfigFile, jsYaml.dump(lapis));

console.log('Successfully wrote: ', backendConfigFile, websiteConfigFile, lapisSiloConfigFile);
