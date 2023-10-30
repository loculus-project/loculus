export type Config = {
    schema: {
        instanceName: string;
        metadata: Metadata[];
        tableColumns: string[];
        primaryKey: string;
    };
};

export type Metadata = {
    name: string;
    type: 'string' | 'date' | 'integer' | 'pango_lineage';
    autocomplete?: boolean;
    notSearchable?: boolean;
};

export type Filter = Metadata & {
    filterValue: string;
    label?: string;
};
