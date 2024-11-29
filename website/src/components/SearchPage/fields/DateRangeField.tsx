import type { FieldValues, GroupedMetadataFilter, SetAFieldValue } from "../../../types/config"

export type DateRangeFieldProps = {
    field: GroupedMetadataFilter,
    fieldValues: FieldValues,
    setAFieldValue: SetAFieldValue,
};



export const DateRangeField = ({
    field, fieldValues, setAFieldValue
}: DateRangeFieldProps) => {
    // extract relevant fieldValues

    const lowerFromKey = field.groupedFields.filter((f) => f.label?.endsWith('From') && f.rangeOverlapSearch!.bound === 'lower')[0].name
    const lowerToKey = field.groupedFields.filter((f) => f.label?.endsWith('To') && f.rangeOverlapSearch!.bound === 'lower')[0].name
    const upperFromKey = field.groupedFields.filter((f) => f.label?.endsWith('From') && f.rangeOverlapSearch!.bound === 'upper')[0].name
    const upperToKey = field.groupedFields.filter((f) => f.label?.endsWith('To') && f.rangeOverlapSearch!.bound === 'upper')[0].name

    if (lowerFromKey in fieldValues && upperToKey in fieldValues && !(lowerToKey in fieldValues) && !(upperFromKey in fieldValues)) {
        // we're strict
    } else if (lowerToKey in fieldValues && upperFromKey in fieldValues && !(lowerFromKey in fieldValues) && !(upperFromKey in fieldValues)) {
        // we're lax
    } else {
        // combination of fields doesn't exist, error
    }


    // decide whether we're lax or strict


    // add the two date inputs and the lax/strict switch
    return (

        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
        <h3 className='text-gray-500 text-sm mb-1'>
            {field.displayName}
        </h3>

 
        {}
    </div>
    )
};