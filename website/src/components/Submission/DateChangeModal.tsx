import {Datepicker} from 'flowbite-react'
import { DateTime } from 'luxon'
import {useState} from 'react'
export const DateChangeModal = (
    {
        restrictedUntil,
        setRestrictedUntil,
        setDateChangeModalOpen,
        minDate,
        maxDate,
    }: {
        restrictedUntil: DateTime,
        setRestrictedUntil: (datetime : DateTime) => void,
        setDateChangeModalOpen: (isOpen : boolean) => void,
        minDate: DateTime,
        maxDate: DateTime,
    },
    
) => {
    const [date, setDate] = useState(restrictedUntil.toJSDate());
    return (
        <div className='fixed inset-0 bg-gray-900 bg-opacity-75 flex justify-center items-center z-50'>
            <div className='bg-white p-6 rounded-lg'>
                <h2 className='font-medium text-lg'>Change date until which sequences are restricted</h2>
                {//"bg-cyan-700"
    }
                <Datepicker defaultDate={date}
                showClearButton={false}
                showTodayButton={false}

                minDate={minDate.toJSDate()}
                maxDate={maxDate.toJSDate()}

                 onSelectedDateChanged={(date) => 
                    {
                        setDate(date)
                    
                    }

                    }
                    




                inline={true}
                />
                <div className='flex justify-end gap-4 mt-4'>
                    <button
                        className='px-4 py-2 btn normal-case'
                        onClick={() => setDateChangeModalOpen(false)}
                    >
                        Cancel
                    </button>
                    <button
                        className='px-4 py-2 btn normal-case'
                        onClick={() => {
                            setRestrictedUntil(DateTime.fromJSDate(date));

                            
                            setDateChangeModalOpen(false)}}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}