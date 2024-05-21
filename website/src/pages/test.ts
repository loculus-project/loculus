import { lapisClientHooks } from "../services/serviceHooks";

const {mutate} = lapisClientHooks('https://lapis-main.loculus.org/dummy-organism').zodiosHooks.useDetails({
}, {});


mutate({
    orderBy:[{
        field: 'field1',
        type: 'ascending',
    }]
},
{}
);