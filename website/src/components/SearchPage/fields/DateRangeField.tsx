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