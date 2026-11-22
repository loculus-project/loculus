import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode, MouseEvent as ReactMouseEvent, UIEvent } from 'react';

interface ScrollContainerProps {
    children: ReactNode;
}

const TRACK_HEIGHT = 10;
const TRACK_INSET = 5;

/**
 * Horizontally scrollable container with a custom scrollbar. While the bottom of the content is
 * below the viewport, the scrollbar is pinned to the bottom of the window so wide tables can be
 * scrolled without first scrolling to their end; otherwise it sits directly below the content.
 * Edge fades indicate that there is more content to either side.
 */
const ScrollContainer: React.FC<ScrollContainerProps> = ({ children }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [maxScroll, setMaxScroll] = useState(0);
    const [handleWidth, setHandleWidth] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [startScrollLeft, setStartScrollLeft] = useState(0);
    const [trackStyle, setTrackStyle] = useState({ left: 0, width: 0 });
    const [pinned, setPinned] = useState(false);

    const updatePositions = () => {
        const element = scrollRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const clientWidth = element.clientWidth;
        const scrollWidth = element.scrollWidth;

        setMaxScroll(scrollWidth - clientWidth);
        setScrollLeft(element.scrollLeft);

        const computedTrackWidth = clientWidth - 2 * TRACK_INSET;
        setHandleWidth((clientWidth / scrollWidth) * computedTrackWidth);
        setTrackStyle({ left: rect.left + TRACK_INSET, width: computedTrackWidth });

        // Pin the scrollbar to the window only while the content is on screen but its bottom isn't.
        setPinned(rect.top < window.innerHeight && rect.bottom > window.innerHeight);
    };

    useEffect(() => {
        updatePositions();
        window.addEventListener('resize', updatePositions);
        window.addEventListener('scroll', updatePositions);

        // The content changes size when data loads, columns change or the table is swapped for the
        // empty state, without a window event. Observe a stable wrapper that sizes to its content.
        const resizeObserver = new ResizeObserver(updatePositions);
        if (scrollRef.current) {
            resizeObserver.observe(scrollRef.current);
        }
        if (contentRef.current) {
            resizeObserver.observe(contentRef.current);
        }

        return () => {
            window.removeEventListener('resize', updatePositions);
            window.removeEventListener('scroll', updatePositions);
            resizeObserver.disconnect();
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

    const isScrollable = maxScroll > 0;
    const handlePosition =
        trackStyle.width && isScrollable ? (scrollLeft / maxScroll) * (trackStyle.width - handleWidth) : 0;
    const canScrollLeft = isScrollable && scrollLeft > 1;
    const canScrollRight = isScrollable && scrollLeft < maxScroll - 1;

    const handle = (
        <div
            onMouseDown={onMouseDownHandle}
            className='bg-gray-400 hover:bg-gray-500'
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
    );

    return (
        <div>
            <div className='relative'>
                <div ref={scrollRef} onScroll={handleScroll} className='overflow-x-scroll hide-scrollbar'>
                    <div ref={contentRef} className='w-fit min-w-full'>
                        {children}
                    </div>
                </div>
                <div
                    aria-hidden='true'
                    className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-white to-transparent transition-opacity duration-150 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
                />
                <div
                    aria-hidden='true'
                    className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-white to-transparent transition-opacity duration-150 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
                />
            </div>

            {isScrollable && (
                <>
                    {/* Always reserve space below the content so the page doesn't jump when the bar un-pins. */}
                    <div
                        className='relative mt-1 bg-gray-100'
                        style={{
                            marginLeft: TRACK_INSET,
                            marginRight: TRACK_INSET,
                            height: TRACK_HEIGHT,
                            borderRadius: TRACK_HEIGHT / 2,
                            visibility: pinned ? 'hidden' : 'visible',
                        }}
                    >
                        {!pinned && handle}
                    </div>
                    {pinned && (
                        <div
                            className='bg-gray-100 shadow-[0_0_0_3px_white]'
                            style={{
                                position: 'fixed',
                                bottom: '3px',
                                left: `${trackStyle.left}px`,
                                width: `${trackStyle.width}px`,
                                height: TRACK_HEIGHT,
                                borderRadius: TRACK_HEIGHT / 2,
                                zIndex: 10,
                            }}
                        >
                            {handle}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ScrollContainer;
