const { generateConfig } = require('../src/generateConfig');
const { expect } = require('chai');
const jsYaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const filesPath = path.join(__dirname, 'files');
const inputFile = path.join(filesPath, 'input.yml');
const expectedWebsiteConfigFile = path.join(filesPath, 'expected_website_config.json');
const expectedBackendConfigFile = path.join(filesPath, 'expected_backend_config.json');
const expectedDatabaseConfigFile = path.join(filesPath, 'expected_database_config.yaml');

describe('generateConfig', () => {
    it('should throw a validation error when input has invalid format', () => {
        expect(() => generateConfig({ invalidField: 'invalid value' })).to.throw(/invalid_type/);
    });

    it('should not add additional fields to the backend config', () => {
        const inputConfig = readYamlFile(inputFile);
        const expectedBackendConfig = readJsonFile(expectedBackendConfigFile);

        const { backend } = generateConfig(inputConfig);

        expect(backend).to.deep.equal(expectedBackendConfig);
    });

    it('should add additional fields to the website config', () => {
        const inputConfig = readYamlFile(inputFile);
        const expectedWebsiteConfig = readJsonFile(expectedWebsiteConfigFile);

        const { website } = generateConfig(inputConfig);

        expect(website).to.deep.equal(expectedWebsiteConfig);
    });

    it('should add additional fields to the config for LAPIS and SILO', () => {
        const inputConfig = readYamlFile(inputFile);
        const expectedDatabaseConfig = jsYaml.load(fs.readFileSync(expectedDatabaseConfigFile, 'utf8'));

        const { lapis } = generateConfig(inputConfig);

        expect(lapis).to.deep.equal(expectedDatabaseConfig);
    });

    it('should complain about unrecognized keys', () => {
        const input = {
            schema: {
                instanceName: 'Test',
                metadata: [],
                primaryKey: 'primary key',
                website: { tableColumns: [] },
                silo: { dateToSortBy: 'date', partitionBy: 'partition' },
                unexpectedKey: 'this should not be here',
            },
        };

        expect(() => generateConfig(input)).to.throw(/unrecognized_keys/);
    });

    function readYamlFile(inputPath) {
        return jsYaml.load(fs.readFileSync(inputPath, 'utf8'));
    }

    function readJsonFile(inputPath) {
        return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    }
});
