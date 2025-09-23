import {
    useEffect,
    useRef,
    useState,
    type FC,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    type UIEvent,
} from 'react';

interface ScrollContainerProps {
    children: ReactNode;
}

interface TrackStyle {
    left: number;
    width: number;
}

const ScrollContainer: FC<ScrollContainerProps> = ({ children }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollLeft, setScrollLeft] = useState<number>(0);
    const [maxScroll, setMaxScroll] = useState<number>(0);
    const [handleWidth, setHandleWidth] = useState<number>(0);
    const [dragging, setDragging] = useState<boolean>(false);
    const [startX, setStartX] = useState<number>(0);
    const [startScrollLeft, setStartScrollLeft] = useState<number>(0);
    const [trackStyle, setTrackStyle] = useState<TrackStyle>({ left: 0, width: 0 });

    const updatePositions = () => {
        if (scrollRef.current) {
            const rect = scrollRef.current.getBoundingClientRect();
            const clientWidth = scrollRef.current.clientWidth;
            const scrollWidth = scrollRef.current.scrollWidth;

            setMaxScroll(scrollWidth - clientWidth);

            const computedTrackWidth = clientWidth - 10;
            setHandleWidth((clientWidth / scrollWidth) * computedTrackWidth);

            const computedLeft = rect.left + (clientWidth - computedTrackWidth) / 2;
            setTrackStyle({ left: computedLeft, width: computedTrackWidth });
        }
    };

    useEffect(() => {
        updatePositions();
        window.addEventListener('resize', updatePositions);
        window.addEventListener('scroll', updatePositions);
        return () => {
            window.removeEventListener('resize', updatePositions);
            window.removeEventListener('scroll', updatePositions);
        };
    }, []);

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        setScrollLeft(e.currentTarget.scrollLeft);
    };

    const onMouseDownHandle = (e: ReactMouseEvent) => {
        setDragging(true);
        setStartX(e.clientX);
        setStartScrollLeft(scrollLeft);
        e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!dragging || !scrollRef.current) return;

        const clientWidth = scrollRef.current.clientWidth;
        const scrollWidth = scrollRef.current.scrollWidth;
        const maxScrollVal = scrollWidth - clientWidth;
        const trackWidth = trackStyle.width;

        const deltaX = e.clientX - startX;
        const scrollDelta = (deltaX / (trackWidth - handleWidth)) * maxScrollVal;
        scrollRef.current.scrollLeft = startScrollLeft + scrollDelta;
    };

    const onMouseUp = () => {
        if (dragging) {
            setDragging(false);
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [dragging, startX, startScrollLeft, handleWidth, trackStyle.width]);

    const handlePosition =
        trackStyle.width && maxScroll > 0 ? (scrollLeft / maxScroll) * (trackStyle.width - handleWidth) : 0;

    return (
        <div>
            <div ref={scrollRef} onScroll={handleScroll} className='overflow-x-scroll hide-scrollbar'>
                {children}
            </div>

            {maxScroll > 0 && (
                <div
                    className='bg-gray-100'
                    style={{
                        position: 'fixed',
                        bottom: '3px',
                        left: `${trackStyle.left}px`,
                        width: `${trackStyle.width}px`,
                        height: '10px',
                        borderRadius: '5px',
                    }}
                >
                    <div
                        onMouseDown={onMouseDownHandle}
                        className='bg-gray-500'
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: `${handleWidth}px`,
                            borderRadius: '6px',
                            transform: `translateX(${handlePosition}px)`,
                            cursor: dragging ? 'grabbing' : 'grab',
                            transition: 'transform 75ms',
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default ScrollContainer;
