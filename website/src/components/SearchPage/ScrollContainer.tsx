import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode, MouseEvent as ReactMouseEvent, UIEvent } from 'react';

interface ScrollContainerProps {
  children: ReactNode;
}

interface TrackStyle {
  left: number;
  width: number;
}

const ScrollContainer: React.FC<ScrollContainerProps> = ({ children }) => {
  // Ref to the scrollable container.
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll-related state.
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [maxScroll, setMaxScroll] = useState<number>(0);
  const [handleWidth, setHandleWidth] = useState<number>(0);

  // Drag state.
  const [dragging, setDragging] = useState<boolean>(false);
  const [startX, setStartX] = useState<number>(0);
  const [startScrollLeft, setStartScrollLeft] = useState<number>(0);

  // State for the fixed scrollbar track style.
  const [trackStyle, setTrackStyle] = useState<TrackStyle>({ left: 0, width: 0 });

  // This combined update function recalculates:
  // 1. The maximum scroll value.
  // 2. The handle's width (proportional to visible content).
  // 3. The fixed track's left position and width.
  const updatePositions = () => {
    if (scrollRef.current) {
      const rect = scrollRef.current.getBoundingClientRect();
      const clientWidth = scrollRef.current.clientWidth;
      const scrollWidth = scrollRef.current.scrollWidth;

      // Set the maximum scroll (the difference between total and visible width)
      setMaxScroll(scrollWidth - clientWidth);

      const computedTrackWidth = clientWidth * 0.95;
      // The handle’s width is proportional to the visible area.
      setHandleWidth((clientWidth / scrollWidth) * computedTrackWidth);

      // Center the track horizontally relative to the container.
      const computedLeft = rect.left + (clientWidth - computedTrackWidth) / 2;
      setTrackStyle({ left: computedLeft, width: computedTrackWidth });
    }
  };

  // On mount, update positions. Also update on window resize or scroll.
  useEffect(() => {
    updatePositions();
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions);
    return () => {
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions);
    };
  }, []);

  // When the user scrolls the container, update our scrollLeft state.
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // When the user starts dragging the scrollbar handle.
  const onMouseDownHandle = (e: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
    setDragging(true);
    setStartX(e.clientX);
    setStartScrollLeft(scrollLeft);
    e.preventDefault();
  };

  // While dragging, calculate the new scroll position.
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging || !scrollRef.current) return;

    const clientWidth = scrollRef.current.clientWidth;
    const scrollWidth = scrollRef.current.scrollWidth;
    const maxScrollVal = scrollWidth - clientWidth;
    const trackWidth = trackStyle.width;

    const deltaX = e.clientX - startX;
    // Determine how far to scroll based on the handle’s movement relative to the track.
    const scrollDelta = (deltaX / (trackWidth - handleWidth)) * maxScrollVal;
    scrollRef.current.scrollLeft = startScrollLeft + scrollDelta;
  };

  // When the mouse is released, stop dragging.
  const onMouseUp = () => {
    if (dragging) {
      setDragging(false);
    }
  };

  // Listen for mouse move/up events on the window.
  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, startX, startScrollLeft, handleWidth, trackStyle.width]);

  // Compute the handle’s position on the track based on current scroll.
  const handlePosition =
    trackStyle.width && maxScroll > 0
      ? (scrollLeft / maxScroll) * (trackStyle.width - handleWidth)
      : 0;

  return (
    <div>
      {/* Scrollable content with hidden default scrollbars */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-x-scroll hide-scrollbar"
      >
        {children}
      </div>

      {/* Render the custom scrollbar only when there is overflow (maxScroll > 0) */}
      {maxScroll > 0 && (
        <div
          className="bg-gray-100"
          style={{
            position: 'fixed',
            bottom: '4px',
            left: `${trackStyle.left}px`,
            width: `${trackStyle.width}px`,
            height: '12px',
            borderRadius: '6px',
            zIndex: 1000,
          }}
        >
          {/* The draggable handle */}
          <div
            onMouseDown={onMouseDownHandle}
            className="bg-gray-500"
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
