import { Tooltip } from 'react-tooltip';

export const CustomTooltip: React.FC<React.ComponentProps<typeof Tooltip>> = ({ ...props }) => (
    // Set positionStrategy and z-index to make the Tooltip float above the ReviewPage toolbar
    <Tooltip positionStrategy='fixed' className='z-20' place='right' {...props} />
);
