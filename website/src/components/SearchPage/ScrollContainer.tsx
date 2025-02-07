import { useEffect, useRef, useState } from 'react';

const ScrollContainer = ({ children }) => {
  const scrollRef = useRef(null);
  const trackRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [handleWidth, setHandleWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startScrollLeft, setStartScrollLeft] = useState(0);

  useEffect(() => {
    const updateSizes = () => {
      if (scrollRef.current && trackRef.current) {
        const clientWidth = scrollRef.current.clientWidth;
        const scrollWidth = scrollRef.current.scrollWidth;
        setMaxScroll(scrollWidth - clientWidth);
        const trackWidth = trackRef.current.offsetWidth;
        setHandleWidth((clientWidth / scrollWidth) * trackWidth);
      }
    };
    updateSizes();
    window.addEventListener('resize', updateSizes);
    return () => window.removeEventListener('resize', updateSizes);
  }, []);

  const handleScroll = (e) => setScrollLeft(e.target.scrollLeft);

  const onMouseDownHandle = (e) => {
    setDragging(true);
    setStartX(e.clientX);
    setStartScrollLeft(scrollLeft);
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    if (scrollRef.current && trackRef.current) {
      const trackWidth = trackRef.current.offsetWidth;
      const clientWidth = scrollRef.current.clientWidth;
      const scrollWidth = scrollRef.current.scrollWidth;
      const maxScrollVal = scrollWidth - clientWidth;
      const deltaX = e.clientX - startX;
      const scrollDelta = (deltaX / (trackWidth - handleWidth)) * maxScrollVal;
      scrollRef.current.scrollLeft = startScrollLeft + scrollDelta;
    }
  };

  const onMouseUp = () => dragging && setDragging(false);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, startX, startScrollLeft, handleWidth]);

  const handlePosition = trackRef.current && maxScroll > 0 
    ? (scrollLeft / maxScroll) * (trackRef.current.offsetWidth - handleWidth)
    : 0;

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-x-scroll"
      >
        {children}
      </div>

      <div
        ref={trackRef}
        className="fixed bottom-4 left-0 right-0 mx-auto"
        style={{
          width: '80%',
          height: '12px',
          backgroundColor: '#ccc',
          borderRadius: '6px',
        }}
      >
        <div
          onMouseDown={onMouseDownHandle}
          className="absolute top-0 left-0 h-full bg-blue-500 rounded transition-transform duration-75"
          style={{
            width: `${handleWidth}px`,
            transform: `translateX(${handlePosition}px)`,
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        />
      </div>
    </div>
  );
};

export default ScrollContainer;
