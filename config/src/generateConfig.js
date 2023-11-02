const { z } = require('zod');

const baseMetadataSchema = z.object({
    name: z.string(),
    type: z.union([
        z.literal('string'),
        z.literal('pango_lineage'),
        z.literal('int'),
        z.literal('float'),
        z.literal('date'),
    ]),
});

const siloMetadataSchema = baseMetadataSchema.merge(
    z.object({
        generateIndex: z.boolean().optional(),
    }),
);

const websiteMetadataSchema = baseMetadataSchema.merge(
    z.object({
        required: z.boolean().optional(),
        autocomplete: z.boolean().optional(),
        notSearchable: z.boolean().optional(),
    }),
);

const inputSchema = z
    .object({
        schema: z
            .object({
                instanceName: z.string(),
                metadata: z.array(siloMetadataSchema.merge(websiteMetadataSchema).strict()),
                primaryKey: z.string(),
                website: z
                    .object({
                        tableColumns: z.array(z.string()),
                    })
                    .strict(),
                silo: z
                    .object({
                        dateToSortBy: z.string(),
                        partitionBy: z.string(),
                    })
                    .strict(),
            })
            .strict(),
    })
    .strict();

function generateConfig(inputConfig) {
    const validatedInputConfig = inputSchema.parse(inputConfig);

    const schema = validatedInputConfig.schema;

    return {
        website: makeSchema({
            instanceName: schema.instanceName,
            metadata: makeWebsiteMetadata(schema.metadata),
            primaryKey: schema.primaryKey,
            ...schema.website,
        }),
        backend: makeSchema({
            instanceName: schema.instanceName,
            metadata: makeBackendMetadata(schema.metadata),
        }),
        lapis: makeSchema({
            instanceName: schema.instanceName,
            opennessLevel: 'OPEN',
            metadata: makeSiloMetadata(schema.metadata),
            primaryKey: schema.primaryKey,
            ...schema.silo,
        }),
    };
}

const additionalMetadataFields = [
    {
        name: 'sequenceId',
        type: 'string',
    },
    {
        name: 'version',
        type: 'int',
        notSearchable: true,
    },
    {
        name: 'customId',
        type: 'string',
    },
    {
        name: 'sequenceVersion',
        type: 'string',
    },
    {
        name: 'isRevocation',
        type: 'string',
        notSearchable: true,
    },
    {
        name: 'submitter',
        type: 'string',
    },
    {
        name: 'submittedAt',
        type: 'string',
    },
    {
        name: 'versionStatus',
        type: 'string',
        notSearchable: true,
    },
];

function makeWebsiteMetadata(metadata) {
    return [...metadata, ...additionalMetadataFields].map((metadatum) => websiteMetadataSchema.parse(metadatum));
}

function makeBackendMetadata(metadata) {
    return metadata.map((metadatum) => baseMetadataSchema.parse(metadatum));
}

function makeSiloMetadata(metadata) {
    return [...metadata, ...additionalMetadataFields].map((metadatum) => siloMetadataSchema.parse(metadatum));
}

function makeSchema(schema) {
    return { schema };
}

module.exports = {
    generateConfig,
};
