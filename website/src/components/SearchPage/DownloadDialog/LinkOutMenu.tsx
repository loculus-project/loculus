import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { type MutableRefObject, type FC, useState, useRef, useMemo } from 'react';

import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator';
import { type SequenceFilter } from './SequenceFilters';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes';
import type { LinkOut } from '../../../types/config';
import type { ReferenceGenomesInfo } from '../../../types/referencesGenomes';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';
import type { ReferenceSelection } from '../../../utils/referenceSelection';
import { getSegmentLapisNames } from '../../../utils/sequenceTypeHelpers';
import { processTemplate, matchPlaceholders } from '../../../utils/templateProcessor';
import { Button } from '../../common/Button';
import BasicModal from '../../common/Modal';
import DashiconsExternal from '~icons/dashicons/external';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

const DATA_TYPES = ['unalignedNucleotideSequences', 'metadata', 'alignedNucleotideSequences'] as const;
type DataType = (typeof DATA_TYPES)[number];

type LinkOutMenuProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    sequenceCount?: number;
    linkOuts: LinkOut[];
    dataUseTermsEnabled: boolean;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceSelection?: ReferenceSelection;
};

export const LinkOutMenu: FC<LinkOutMenuProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    sequenceCount,
    linkOuts,
    dataUseTermsEnabled,
    referenceGenomesInfo,
    referenceSelection,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isDataUseTermsModalVisible, setDataUseTermsModalVisible] = useState(false);
    const currentLinkOut = useRef<LinkOut | null>(null);

    const selectedReferences = referenceSelection?.selectedReferences;
    const segmentLapisNames = useMemo(
        () => getSegmentLapisNames(referenceGenomesInfo, selectedReferences),
        [referenceGenomesInfo, selectedReferences],
    );
    const filteredLinkOuts = useMemo(
        () =>
            linkOuts.filter((linkOut) => {
                if (!linkOut.onlyForReferences) return true;
                if (!selectedReferences) return true;
                return Object.entries(linkOut.onlyForReferences).every(
                    ([segment, refName]) =>
                        // Do not filter out linkOuts that are only for specific references when no reference is selected.
                        selectedReferences[segment] === null || selectedReferences[segment] === refName,
                );
            }),
        [linkOuts, selectedReferences],
    );

    const handleLinkClick = (linkOut: LinkOut) => {
        currentLinkOut.current = linkOut;
        if (
            linkOut.maxNumberOfRecommendedEntries !== undefined &&
            sequenceCount !== undefined &&
            sequenceCount > linkOut.maxNumberOfRecommendedEntries
        ) {
            const proceed = confirm(
                `Warning: This tool is recommended for at most ${linkOut.maxNumberOfRecommendedEntries} sequences. You are attempting to use ${sequenceCount}. Continue?`,
            );
            if (!proceed) {
                return;
            }
        }
        if (dataUseTermsEnabled) {
            setDataUseTermsModalVisible(true);
        } else {
            const url = generateLinkOutUrl(currentLinkOut.current);
            openUrl(url);
        }
    };

    const generateLinkOutUrl = (linkOut: LinkOut, includeRestricted = false) => {
        const placeholders = matchPlaceholders(linkOut.url);

        const urlMap: Record<string, string> = {};
        for (const match of placeholders) {
            const { fullMatch, dataType, segment, richHeaders, dataFormat, columns } = match;

            if (!DATA_TYPES.includes(dataType as DataType)) {
                continue;
            }

            let dataTypeOption: DownloadOption['dataType'];

            switch (dataType) {
                case 'metadata':
                    dataTypeOption = {
                        type: 'metadata',
                        fields: columns ?? [],
                    };
                    break;

                case 'unalignedNucleotideSequences':
                    dataTypeOption = {
                        type: 'unalignedNucleotideSequences',
                        segmentLapisNames: segment ? segmentLapisNames.find((sln) => sln.name === segment) : undefined,
                        richFastaHeaders: { include: richHeaders === true },
                    };
                    break;

                case 'alignedNucleotideSequences':
                    dataTypeOption = {
                        type: 'alignedNucleotideSequences',
                        segment: segment,
                        richFastaHeaders: { include: richHeaders === true },
                    };
                    break;

                default:
                    throw new Error(`Unsupported dataType: ${dataType}`);
            }

            const downloadOption: DownloadOption = {
                includeRestricted: includeRestricted,
                dataType: dataTypeOption,
                compression: undefined,
                dataFormat: dataFormat,
            };

            const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);
            urlMap[fullMatch.slice(1, -1)] = url;
        }

        return processTemplate(linkOut.url, urlMap);
    };

    const openUrl = (url: string) => {
        if (url.length > approxMaxAcceptableUrlLength) {
            alert(
                `Warning: The generated URL for the tool is very long (${url.length} characters) and may not work in some browsers or servers. This may relate to your current search filter settings.`,
            );
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleIncludeRestricted = () => {
        if (currentLinkOut.current) {
            const url = generateLinkOutUrl(currentLinkOut.current, true);
            openUrl(url);
        }
        setDataUseTermsModalVisible(false);
    };

    const handleOpenLinkWithOpenOnly = () => {
        if (currentLinkOut.current) {
            const url = generateLinkOutUrl(currentLinkOut.current, false);
            openUrl(url);
        }
        setDataUseTermsModalVisible(false);
    };

    // Group filtered linkOuts by their optional `category` field.
    // LinkOuts without a category appear at the top; those with a category are grouped under labelled sections.
    const groupedLinkOuts = useMemo(() => {
        const hasAnyCategory = filteredLinkOuts.some((linkOut) => linkOut.category);
        if (!hasAnyCategory) return null;

        const uncategorizedItems: LinkOut[] = [];
        const categoryMap = new Map<string, LinkOut[]>();

        for (const linkOut of filteredLinkOuts) {
            if (linkOut.category) {
                if (!categoryMap.has(linkOut.category)) categoryMap.set(linkOut.category, []);
                categoryMap.get(linkOut.category)!.push(linkOut);
            } else {
                uncategorizedItems.push(linkOut);
            }
        }

        return { uncategorizedItems, categoryMap };
    }, [filteredLinkOuts]);

    const renderLinkOutButton = (linkOut: LinkOut) => (
        <MenuItem key={linkOut.name}>
            {({ focus }) => (
                <Button
                    onClick={() => handleLinkClick(linkOut)}
                    className={`
                        ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                        flex items-center justify-between px-4 py-2 text-sm w-full text-left
                    `}
                >
                    {linkOut.name}
                    <DashiconsExternal className='h-4 w-4 ml-2' />
                </Button>
            )}
        </MenuItem>
    );

    return (
        <>
            <Menu as='div' className='ml-2 relative inline-block text-left'>
                <MenuButton
                    className='outlineButton flex items-center min-w-[100px] justify-between h-full'
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span>Tools</span>
                    <IwwaArrowDown className='ml-2 h-5 w-5' aria-hidden='true' />
                </MenuButton>

                <MenuItems className='absolute right-0 mt-2 w-64  origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none'>
                    <div className='py-1'>
                        <div className='px-4 py-2 text-sm text-gray-500'>
                            Analyze {sequenceCount !== undefined ? formatNumberWithDefaultLocale(sequenceCount) : '...'}{' '}
                            sequences with:
                        </div>
                        {groupedLinkOuts !== null ? (
                            <>
                                {groupedLinkOuts.uncategorizedItems.map(renderLinkOutButton)}
                                {Array.from(groupedLinkOuts.categoryMap.entries()).map(([category, items]) => (
                                    <div key={category}>
                                        <div className='px-4 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider'>
                                            {category}
                                        </div>
                                        {items.map(renderLinkOutButton)}
                                    </div>
                                ))}
                            </>
                        ) : (
                            filteredLinkOuts.map(renderLinkOutButton)
                        )}
                    </div>
                </MenuItems>
            </Menu>
            {dataUseTermsEnabled && (
                <LinkOutMenuDataUseTermModal
                    modalVisible={isDataUseTermsModalVisible}
                    setModalVisible={setDataUseTermsModalVisible}
                    currentLinkOut={currentLinkOut}
                    onClick={handleOpenLinkWithOpenOnly}
                    onClick1={handleIncludeRestricted}
                />
            )}
        </>
    );
};

function LinkOutMenuDataUseTermModal(props: {
    modalVisible: boolean;
    setModalVisible: (value: ((prevState: boolean) => boolean) | boolean) => void;
    currentLinkOut: MutableRefObject<LinkOut | null>;
    onClick: () => void;
    onClick1: () => void;
}) {
    return (
        <BasicModal isModalVisible={props.modalVisible} setModalVisible={props.setModalVisible}>
            <div className='p-6'>
                <h2 className='text-xl font-bold mb-2'>
                    Options for launching {props.currentLinkOut.current?.name ?? 'Tool'}
                </h2>
                <h3 className='text-lg font-medium text-gray-700 mb-4 mt-6'>Data use terms</h3>
                <p className='mb-6 text-gray-600'>
                    Would you like to include Restricted-Use sequences in this analysis? (If you do, you must comply
                    with the Restricted-Use terms.)
                </p>
                <div className='flex justify-end space-x-4'>
                    <Button
                        className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors'
                        onClick={props.onClick}
                    >
                        Open sequences only
                    </Button>
                    <Button
                        className='px-4 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 transition-colors'
                        onClick={props.onClick1}
                    >
                        Include Restricted-Use
                    </Button>
                </div>
            </div>
        </BasicModal>
    );
}
