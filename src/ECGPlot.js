import React, { useEffect, useRef, useState } from 'react';
import './ECGPlot.css';

const ECGPlot = ({ 
  data, 
  windowSize = 1250, 
  currentWindow = 0,
  totalWindows = 1,
  showGrid = true,
  showSampleNumbers = true,
  height = 300,
  classification = null,
  onWindowChange = null,
  startIndex = 0
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);

  // Signal black
  const getSignalColor = () => 'black';

  

  // Render the ECG plot
  useEffect(() => {
    // Y-axis range from -3 to 5 (total range of 8)
    const yMin = -3;
    const yMax = 5;
    const yRange = yMax - yMin;
    if (!data || !svgRef.current) return;
    
    const svg = svgRef.current;
    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // Set viewBox for proper scaling
    const viewBoxWidth = windowSize;
    svg.setAttribute('viewBox', `${panOffset} 0 ${viewBoxWidth / zoomLevel} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    
    // Create grid
    if (showGrid) {
      const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gridGroup.classList.add('ecg-grid');
      

      // Fill background with light pink
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', 0);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', windowSize);
      rect.setAttribute('height', height);
      rect.setAttribute('class', 'ecg-background');
      gridGroup.appendChild(rect);

      // Vertical grid lines: minor every 10 samples (1mm, 0.04s), major every 50 samples (5mm, 0.2s)
      // Now vertical lines go from y = -3 to y = 5
      const yStart = height - ((-3 - yMin) / yRange * height);
      const yEnd = height - ((5 - yMin) / yRange * height);
      for (let i = 0; i <= windowSize; i += 1) {
        if (i % 10 === 0) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', i);
          line.setAttribute('y1', yEnd);
          line.setAttribute('x2', i);
          line.setAttribute('y2', yStart);
          if (i % 50 === 0) {
            line.setAttribute('class', 'grid-line-major'); // 5mm, 0.2s
          } else {
            line.setAttribute('class', 'grid-line-minor'); // 1mm, 0.04s
          }
          gridGroup.appendChild(line);
        }
        // X-axis label every 50 samples (0.2s)
        if (i % 50 === 0 && i !== 0 && i < windowSize) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', i);
          text.setAttribute('y', height + 18);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('class', 'sample-number');
          text.textContent = (i / 250).toFixed(2); // show seconds
          gridGroup.appendChild(text);
        }
      }
      // Horizontal grid lines: minor every 0.1 microvolt (1mm), major every 0.5 microvolt (5mm)
      // Ensure lines are visible from -3 up to and including 5
      for (let value = -3; value <= 5 + 0.0001; value += 0.1) {
        // Avoid floating point errors causing missed lines at 0 and other steps
        const roundedValue = Math.round(value * 1000) / 1000;
        const yPos = height - ((roundedValue - yMin) / yRange * height);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0);
        line.setAttribute('y1', yPos);
        line.setAttribute('x2', windowSize);
        line.setAttribute('y2', yPos);
        if (Math.abs((roundedValue * 10) % 5) < 0.0001 || Number.isInteger(roundedValue)) {
          line.setAttribute('class', 'grid-line-major'); // 5mm, 0.5 microvolt or integer value
        } else {
          line.setAttribute('class', 'grid-line-minor'); // 1mm, 0.1 microvolt
        }
        gridGroup.appendChild(line);
      }


      // Y-axis label (rotated)
      const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      yLabel.setAttribute('x', -height / 2);
      yLabel.setAttribute('y', -35);
      yLabel.setAttribute('transform', `rotate(-90)`);
      yLabel.setAttribute('text-anchor', 'middle');
      yLabel.setAttribute('class', 'axis-label');
      yLabel.textContent = 'Microvolt';
      gridGroup.appendChild(yLabel);
      


      
      svg.appendChild(gridGroup);
    }
    
    // Create path for ECG signal
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', getSignalColor());
    path.setAttribute('stroke-width', 1.5);
    path.setAttribute('fill', 'none');
    path.setAttribute('class', 'ecg-signal');
    
    // Generate path data
    let pathData = '';
    
    // Use a more efficient approach for large datasets
    const sampleRate = data.length > 2500 ? Math.floor(data.length / 2500) : 1;

    for (let i = 0; i < data.length; i += sampleRate) {
      const x = i;
      // Normalize the ECG value to fit in the SVG with the -2 to 4 range
      // Map the value from the data range to the SVG height
      // Invert Y because SVG coordinates increase downward
      const value = data[i];
      const normalizedValue = Math.max(yMin, Math.min(yMax, value)); // Clamp to range
      const y = height - ((normalizedValue - yMin) / yRange * height);
      if (i === 0) {
        pathData += `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    

    

    
  }, [data, currentWindow, windowSize, showGrid, showSampleNumbers, height, classification, zoomLevel, panOffset, startIndex]); // End of useEffect
  
  // Handle zoom and pan interactions
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const newZoomLevel = Math.max(1, Math.min(5, zoomLevel + (e.deltaY > 0 ? -0.2 : 0.2)));
      setZoomLevel(newZoomLevel);
      setIsZoomed(newZoomLevel > 1);
    } else if (isZoomed) {
      // Pan horizontally when zoomed
      e.preventDefault();
      const maxPan = windowSize * (1 - 1/zoomLevel);
      const newPanOffset = Math.max(0, Math.min(maxPan, panOffset + (e.deltaX > 0 ? 20 : -20)));
      setPanOffset(newPanOffset);
    }
  };
  
  const handleMouseDown = (e) => {
    if (isZoomed) {
      setIsDragging(true);
      setDragStart(e.clientX);
    }
  };
  
  const handleMouseMove = (e) => {
    if (isDragging && isZoomed) {
      const dx = dragStart - e.clientX;
      const maxPan = windowSize * (1 - 1/zoomLevel);
      const newPanOffset = Math.max(0, Math.min(maxPan, panOffset + dx * 2));
      setPanOffset(newPanOffset);
      setDragStart(e.clientX);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const handleDoubleClick = () => {
    // Reset zoom and pan
    setZoomLevel(1);
    setPanOffset(0);
    setIsZoomed(false);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft' && onWindowChange) {
      e.preventDefault();
      onWindowChange('prev');
    } else if (e.key === 'ArrowRight' && onWindowChange) {
      e.preventDefault();
      onWindowChange('next');
    }
  };
  
  return (
    <div 
      className="ecg-plot-container" 
      ref={containerRef}
      tabIndex="0"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="ecg-controls">
        {onWindowChange && (
          <>
            <button 
              className="window-nav-button" 
              onClick={() => onWindowChange('first')}
              disabled={currentWindow === 0}
            >
              &laquo; First
            </button>
            <button 
              className="window-nav-button" 
              onClick={() => onWindowChange('prev')}
              disabled={currentWindow === 0}
            >
              &lt; Prev
            </button>
            <span className="window-counter">
              Window {currentWindow + 1} of {totalWindows}
            </span>
            <button 
              className="window-nav-button" 
              onClick={() => onWindowChange('next')}
              disabled={currentWindow === totalWindows - 1}
            >
              Next &gt;
            </button>
            <button 
              className="window-nav-button" 
              onClick={() => onWindowChange('last')}
              disabled={currentWindow === totalWindows - 1}
            >
              Last &raquo;
            </button>
          </>
        )}
        <div className="zoom-controls">
          <button 
            className="zoom-button" 
            onClick={() => {
              setZoomLevel(Math.max(1, zoomLevel - 0.5));
              setIsZoomed(zoomLevel > 1.5);
            }}
            disabled={zoomLevel <= 1}
          >
            -
          </button>
          <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
          <button 
            className="zoom-button" 
            onClick={() => {
              setZoomLevel(Math.min(5, zoomLevel + 0.5));
              setIsZoomed(true);
            }}
            disabled={zoomLevel >= 5}
          >
            +
          </button>
          <button 
            className="reset-zoom-button" 
            onClick={handleDoubleClick}
            disabled={!isZoomed}
          >
            Reset
          </button>
        </div>
      </div>
      
      <div className="ecg-plot-svg-container">
        <svg 
          ref={svgRef} 
          className="ecg-plot-svg"
          width="100%" 
          height={height}
        />
      </div>
      
      {isZoomed && (
        <div className="zoom-instructions">
          <span>Drag to pan • Mouse wheel to zoom • Double-click to reset</span>
        </div>
      )}
    </div>
  );
};

export default ECGPlot;
