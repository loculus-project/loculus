import React, { useEffect, useState } from 'react';
import TickOutline from '~icons/mdi/tick-outline';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import Edit from '~icons/bxs/edit';
import Trash from '~icons/bxs/trash';
import Note from '~icons/fluent/note-24-filled';
import Arrow from '~icons/mdi/arrow';
import { ClipLoader } from 'react-spinners';

import { Tooltip } from 'react-tooltip';

const KeyValueComponent = ({ keyName, value, extraStyle, keyStyle, warningNote, errorNote }) => {
    return (
        <div className={`flex flex-col m-2 `}>
            <span className={keyStyle ? keyStyle : 'text-gray-500 uppercase text-xs'}>{keyName}</span>
            <span className={`text-base ${extraStyle}`}>
                {value}
                {warningNote && (
                    <span className='text-yellow-500'>
                        <Note
                            className='inline-block'
                            data-tooltip-content='[Note about what this warning is about]'
                            data-tooltip-id='hi'
                        />
                    </span>
                )}
                {errorNote && (
                    <span className='text-red-500'>
                        <Note
                            className='inline-block'
                            data-tooltip-content='[Note about what this error is about]'
                            data-tooltip-id='hi'
                        />
                    </span>
                )}
            </span>
        </div>
    );
};
let myseq_counter = 0;

const generateRandom_originalId = () => {
    // generate alphanumeric sequenceId

    return 'my_seq_' + myseq_counter++;
};

const generateRandom_sequenceId = () => {
    // generate alphanumeric sequenceId

    return 'PB_' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

const makeSingleTestData = () => {
    const testData = {
        status: 'received',
        originalId: generateRandom_originalId(),
        sequenceId: generateRandom_sequenceId(),
    };
    return testData;
};

const processSequence = (sequence) => {
    sequence.processedData = {
        version: 1,
        data: {
            metadata: {
                date: '2020-12-15',
                host: 'Homo sapiens',
                region: 'Europe',
                country: 'Switzerland',
                division: 'Schaffhausen',
            },
            unalignedNucleotideSequences: { main: 'ACTG' },
            alignedNucleotideSequences: { main: '' },
            nucleotideInsertions: { main: [] },
            alignedAminoAcidSequences: {},
            aminoAcidInsertions: {
                ORF1a: [],
                ORF1b: [],
                S: [],
                ORF3a: [],
                E: [],
                M: [],
                ORF6: [],
                ORF7a: [],
                ORF7b: [],
                ORF8: [],
                N: [],
                ORF9b: [],
            },
        },
        errors: [],
        warnings: [],
    };
    const lastCharacter = sequence.sequenceId[sequence.sequenceId.length - 1];
    const tenthCharacter = sequence.sequenceId[4];
    sequence.status = 'silo_ready';

    if (parseInt(lastCharacter) % 2 > 0) {
        sequence.processedData.errors.push({
            source: [
                {
                    type: 'NucleotideSequence',
                    name: 'EndCharacterCheck',
                },
            ],
            affected: [
                {
                    type: 'metadata',
                    name: 'country',
                },
            ],
            message: "Country 'Swizzerland' could not be matched to any known country.",
        });

        sequence.status = 'review_needed';
        sequence.processedData.data.metadata.country = '';
    }

    if (parseInt(tenthCharacter) % 2 > 0) {
        sequence.processedData.warnings.push({
            source: [
                {
                    type: 'NucleotideSequence',
                    name: 'TenthCharacterCheck',
                },
            ],
            affected: [
                {
                    type: 'metadata',
                    name: 'host',
                },
            ],
            message: "Host 'H. sapiens' was adjusted to 'Homo sapiens'.",
        });
    }
};

const makeTestData = () => {
    const testDataList = [];
    for (let i = 0; i < 40; i++) {
        testDataList.push(makeSingleTestData());
    }
    return testDataList;
};

const ReviewCard = ({ data }) => {
    const metadata = data.processedData ? data.processedData.data.metadata : {};
    return (
        <div className='p-3 border rounded-md shadow-lg relative transition-all duration-500'>
            <div className='absolute top-3 right-3 '>
                <div className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block mr-2  text-xl'>
                    <Arrow data-tooltip-content='Release this sequence entry' data-tooltip-id='hi' />
                </div>
                <div className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block  text-xl'>
                    <Edit data-tooltip-content='Edit this sequence entry' data-tooltip-id='hi' />
                </div>
                <div className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block ml-2 text-xl'>
                    <Trash data-tooltip-content='Discard this sequence entry' data-tooltip-id='hi' />
                </div>
            </div>
            <div className='flex flex-wrap '>
                {data.status == 'received' && (
                    <div className='text-gray-500'>
                        {' '}
                        <EmptyCircle />
                    </div>
                )}
                {data.status == 'review_needed' && (
                    <div className='text-red-500'>
                        {' '}
                        <QuestionMark />
                    </div>
                )}
                {data.status == 'processing' && <ClipLoader color='#333333' loading={true} size={20} />}
                {data.status == 'silo_ready' && (
                    <div className={data.processedData.warnings.length == 0 ? 'text-green-500' : 'text-yellow-500'}>
                        {' '}
                        <TickOutline />
                    </div>
                )}
                <KeyValueComponent
                    keyName={data.originalId}
                    value={data.sequenceId}
                    extraStyle='font-medium'
                    keyStyle=' text-gray-600'
                />
                {(data.status == 'silo_ready' || data.status == 'review_needed') &&
                    data.status != 'processing' &&
                    Object.keys(metadata).map((key, index) => (
                        <KeyValueComponent
                            key={index}
                            keyName={key}
                            value={metadata[key]}
                            warningNote={
                                data.processedData.warnings.filter((item) => item.affected[0].name == key).length > 0
                            }
                            errorNote={
                                data.processedData.errors.filter((item) => item.affected[0].name == key).length > 0
                            }
                        />
                    ))}
            </div>
            <div>
                {data.processedData && data.processedData.errors && data.processedData.errors.length > 0 && (
                    <div className='flex flex-col m-2 '>
                        {data.processedData.errors.map((error, index) => (
                            <p className='text-red-500'>
                                {error.message}
                                <br />
                                <span className=' text-sm'>
                                    You must fix this issue before you can release this sequence.
                                </span>
                            </p>
                        ))}
                    </div>
                )}
                {data.processedData && data.processedData.warnings && data.processedData.warnings.length > 0 && (
                    <div className='flex flex-col m-2 '>
                        {data.processedData.warnings.map((error, index) => (
                            <p className='text-yellow-500'>{error.message}</p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const ReviewPage = () => {
    const [testData, setTestData] = useState([]);
    console.log(testData);
    useEffect(() => {
        const fetchData = async () => {
            const data = await makeTestData();
            await new Promise((r) => setTimeout(r, 500));
            setTestData(data);
            for (let i = 0; i < data.length; i += 5) {
                for (let j = 0; j < 5; j++) {
                    if (i + j < data.length) {
                        data[i + j].status = 'processing';
                    }
                }

                setTestData([...data]);
                await new Promise((r) => setTimeout(r, 5000));
                for (let j = 0; j < 5; j++) {
                    if (i + j < data.length) {
                        processSequence(data[i + j]);
                    }
                }
                setTestData([...data]);
            }
        };

        fetchData();
    }, []);

    // count number of sequences with warnings and errors
    let processedCount = 0;
    let unProcessedCount = 0;
    let processingCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    testData.forEach((sequence) => {
        if (sequence.processedData) {
            processedCount++;
            if (sequence.processedData.warnings) {
                warningCount += sequence.processedData.warnings.length;
            }
            if (sequence.processedData.errors) {
                errorCount += sequence.processedData.errors.length;
            }
        }
        if (sequence.status == 'received') {
            unProcessedCount++;
        }
        if (sequence.status == 'processing') {
            processingCount++;
        }
    });

    const [showThese, setShowThese] = useState(['error', 'warning', 'other']);
    const filteredData = testData.filter((item) => {
        if (
            item.processedData &&
            item.processedData.errors &&
            item.processedData.errors.length > 0 &&
            showThese.includes('error')
        ) {
            return true;
        }
        if (
            item.processedData &&
            item.processedData.warnings &&
            item.processedData.warnings.length > 0 &&
            showThese.includes('warning')
        ) {
            return true;
        }
        if (showThese.includes('other')) {
            return true;
        }

        return false;
    });

    return (
        <div>
            <Tooltip id='hi' className='z-50' place='top' effect='solid' />
            <div className='bg-white p-4 sticky z-30 top-0 '>
                <div className='float-right'>
                    {/* discard all sequences with errors */}
                    {errorCount > 0 && (
                        <button
                            className='border rounded-md p-1 bg-gray-500 text-white px-2'
                            onClick={() => {
                                setTestData(
                                    testData.filter(
                                        (item) => item.processedData && item.processedData.errors.length == 0,
                                    ),
                                );
                            }}
                        >
                            Discard {errorCount} sequences with errors
                        </button>
                    )}
                    {processedCount > 0 && (
                        <button className='border rounded-md p-1 bg-gray-500 text-white px-2 ml-2'>
                            Release {processedCount - errorCount} sequences without errors
                        </button>
                    )}
                </div>
                <div className='h-24'>
                    <div className='py-2'>
                        {processingCount > 0 && (
                            <ClipLoader color='#333333' loading={true} size={20} className='mr-2 inline-block' />
                        )}
                        {parseInt(processedCount)} of {testData.length} sequences processed.
                    </div>
                    {showThese.length == 1 && showThese[0] == 'error' ? (
                        <div>
                            Currently showing error sequences.{' '}
                            <button
                                className='border rounded-md p-1 bg-gray-300 text-blackl'
                                onClick={() => {
                                    setShowThese(['error', 'warning', 'other']);
                                }}
                            >
                                Show all sequences
                            </button>
                        </div>
                    ) : (
                        <div className=''>
                            {errorCount > 0 && (
                                <div>
                                    <span className='text-red-500'>{errorCount} sequences with errors:</span>{' '}
                                    <button
                                        className='border rounded-md p-1 bg-gray-500 text-white'
                                        onClick={() => {
                                            setShowThese(['error']);
                                        }}
                                    >
                                        Filter to errors
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div>
                    Show:{' '}
                    <input
                        type='checkbox'
                        checked={showThese.includes('error')}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setShowThese([...showThese, 'error']);
                            } else {
                                setShowThese(showThese.filter((item) => item != 'error'));
                            }
                        }}
                    />{' '}
                    Errors
                    <input
                        className='ml-3'
                        type='checkbox'
                        checked={showThese.includes('warning')}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setShowThese([...showThese, 'warning']);
                            } else {
                                setShowThese(showThese.filter((item) => item != 'warning'));
                            }
                        }}
                    />{' '}
                    Warnings
                    <input
                        className='ml-3'
                        type='checkbox'
                        checked={showThese.includes('other')}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setShowThese([...showThese, 'other']);
                            } else {
                                setShowThese(showThese.filter((item) => item != 'other'));
                            }
                        }}
                    />{' '}
                    Other
                </div>
            </div>
            <div className='p-4 space-y-2'>
                {filteredData && filteredData.map((item, index) => <ReviewCard key={index} data={item} />)}
            </div>
        </div>
    );
};

export default ReviewPage;
