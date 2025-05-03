import React, { useState, useEffect } from 'react';
import './ECGView.css';

import ClassificationView from './ClassificationView';
import ECGPlot from './ECGPlot';

const ECGView = ({ data, prediction, onBack }) => {
  // Debug: log when ECGView unmounts
  useEffect(() => {
    return () => {
      console.log('[ECGView] Unmounting');
    };
  }, []);
  const [currentWindow, setCurrentWindow] = useState(0);
  const [totalWindows, setTotalWindows] = useState(1);
  const [showClassification, setShowClassification] = useState(false);

  // Debug: log when showClassification changes
  useEffect(() => {
    console.log('[ECGView] showClassification:', showClassification);
  }, [showClassification]);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [windowData, setWindowData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  const windowSize = 1250; // 5 seconds at 250Hz 
  
  useEffect(() => {
    if (windowData.length > 0 && !isLoading) {
      console.log(`Loaded ${windowData.length} windows`);
      console.log(`First window length: ${windowData[0]?.data?.length}`);
      if (windowData.length > 1) {
        console.log(`Second window length: ${windowData[1]?.data?.length}`);
      }
    }
  }, [windowData, isLoading]);

  useEffect(() => {
    if (!data) return;
    
    const numWindows = Math.ceil(data.length / windowSize);
    setTotalWindows(numWindows);
    
    const prepareWindows = async () => {
      setIsLoading(true);
      const windows = [];
      
      for (let i = 0; i < numWindows; i++) {
        setLoadingProgress(Math.round((i / numWindows) * 100));
        
        const startIdx = i * windowSize;
        const endIdx = Math.min(startIdx + windowSize, data.length);
        const windowData = data.slice(startIdx, endIdx);
        
        // Create a fixed-size array for each window
        let windowArray = [...windowData];
        
        // Pad any window that's shorter than the window size
        if (windowArray.length < windowSize) {
          const padding = Array(windowSize - windowArray.length).fill(0);
          windowArray.push(...padding);
        }
        
        windows.push({
          window: i,
          data: windowArray
        });
      }
      
      setWindowData(windows);
      setIsLoading(false);
      setLoadingProgress(100);
    };
    
    prepareWindows();
  }, [data]);
  
  const handleWindowChange = (direction) => {
    let newWindow = currentWindow;
    
    switch (direction) {
      case 'next':
        newWindow = Math.min(currentWindow + 1, totalWindows - 1);
        break;
      case 'prev':
        newWindow = Math.max(currentWindow - 1, 0);
        break;
      case 'first':
        newWindow = 0;
        break;
      case 'last':
        newWindow = totalWindows - 1;
        break;
      default:
        if (!isNaN(direction)) {
          newWindow = Math.max(0, Math.min(parseInt(direction), totalWindows - 1));
        }
    }
    
    setCurrentWindow(newWindow);
  };
  
  const handleClassify = () => {
    setShowClassification(true);
  };
  
  
  
  // Generate report from classification results
  const handleGenerateReport = () => {
    if (!windowData.length) return;
    try {
      const totalWindows = windowData.length;
      const classifications = { normal: 0, st: 0, vt: 0, pvt: 0, vf: 0, unclassified: 0 };
      const durations = { normal: 0, st: 0, vt: 0, pvt: 0, vf: 0, unclassified: 0 };
      let windowClassifications = [];
      if (showClassification && prediction && prediction.windows) {
        windowClassifications = prediction.windows.map((w, i) => {
          const label = (() => {
            switch(w.class) {
              case 0: return 'vf';
              case 1: return 'normal';
              case 2: return 'st';
              case 3: return 'vt';
              case 4: return 'pvt';
              default: return 'unclassified';
            }
          })();
          return { window: i, class: w.class, label };
        });
        windowClassifications.forEach(w => {
          classifications[w.label] = (classifications[w.label] || 0) + 1;
          durations[w.label] = (durations[w.label] || 0) + 5;
        });
      } else {
        // fallback: all normal
        windowClassifications = windowData.map((w, i) => ({ window: i, class: 1, label: 'normal' }));
        classifications.normal = totalWindows;
        durations.normal = totalWindows * 5;
      }
      setReportData({
        patientName: 'N/A',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        totalWindows,
        totalDuration: totalWindows * 5,
        classifications,
        durations,
        windowClassifications
      });
      setShowReport(true);
    } catch (error) {
      alert('Failed to generate report: ' + error.message);
    }
  };

  if (showClassification) {
    return (
      <>
        <ClassificationView 
          data={data} 
          prediction={prediction}
          preloadedWindows={windowData}
          onBack={() => {
            console.log('[ECGView] onBack from ClassificationView triggered');
            setShowClassification(false);
          }}
        />
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="classify-button" onClick={handleGenerateReport}>Generate Report</button>
        </div>
        {showReport && reportData && (
          <div className="report-overlay" style={{ zIndex: 1000 }}>
            <div className="report-container">
              <div className="report-header">
                <h2>ECG Analysis Report</h2>
                <button className="close-button" onClick={() => setShowReport(false)}>Close</button>
              </div>
              <div className="report-content">
                <div className="report-section">
                  <h3>Patient Information</h3>
                  <p><strong>Name:</strong> {reportData.patientName}</p>
                  <p><strong>Date:</strong> {reportData.date}</p>
                  <p><strong>Time:</strong> {reportData.time}</p>
                </div>
                <div className="report-section">
                  <h3>ECG Analysis Summary</h3>
                  <p><strong>Total Duration:</strong> {(() => {
                    const total = reportData.totalDuration;
                    if (total < 60) return `${total} seconds`;
                    const min = Math.floor(total / 60);
                    const sec = total % 60;
                    return `${min} minute${min !== 1 ? 's' : ''}${sec > 0 ? ` and ${sec} second${sec !== 1 ? 's' : ''}` : ''}`;
                  })()}</p>
                  <p><strong>Total Windows:</strong> {reportData.totalWindows}</p>
                  <table className="classification-summary">
                    <thead>
                      <tr>
                        <th>Classification</th>
                        <th>Windows</th>
                        <th>Duration (min/sec)</th>
                        <th>Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(reportData.classifications).map(type => (
                        <tr key={type}>
                          <td>{type}</td>
                          <td>{reportData.classifications[type]}</td>
                          <td>{(() => {
                            const dur = reportData.durations[type];
                            if (dur < 60) return `${dur} seconds`;
                            const min = Math.floor(dur / 60);
                            const sec = dur % 60;
                            return `${min} minute${min !== 1 ? 's' : ''}${sec > 0 ? ` and ${sec} second${sec !== 1 ? 's' : ''}` : ''}`;
                          })()}</td>
                          <td>{((reportData.classifications[type] / reportData.totalWindows) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  
  return (
    <div className="upload-section">
      <div className="ecg-view-header">
        <h2>ECG Visualization</h2>
        <div className="ecg-view-actions">
          <button className="classify-button" onClick={handleClassify}>Classify ECG</button>
          <button className="back-button" onClick={onBack}>Back to Dashboard</button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading-overlay">
          <div className="loading-container">
            <div className="loading-bar-container">
              <div 
                className="loading-bar" 
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <div className="loading-text">
              Processing ECG Data... {loadingProgress}%
            </div>
          </div>
        </div>
      ) : (
        <div className="ecg-visualization">
          {windowData.length > 0 && (
            <ECGPlot
              data={windowData[currentWindow]?.data || []}
              windowSize={windowSize}
              currentWindow={currentWindow}
              totalWindows={totalWindows}
              showGrid={true}
              showSampleNumbers={true}
              height={400}
              startIndex={currentWindow * windowSize}
              onWindowChange={handleWindowChange}
            />
          )}
          
          <div className="window-navigation">
            <button 
              className="nav-button" 
              onClick={() => handleWindowChange('first')}
              disabled={currentWindow === 0}
            >
              &laquo; First
            </button>
            <button 
              className="nav-button" 
              onClick={() => handleWindowChange('prev')}
              disabled={currentWindow === 0}
            >
              &lt; Previous
            </button>
            <div className="window-info">
              Window {currentWindow + 1} of {totalWindows}
            </div>
            <button 
              className="nav-button" 
              onClick={() => handleWindowChange('next')}
              disabled={currentWindow === totalWindows - 1}
            >
              Next &gt;
            </button>
            <button 
              className="nav-button" 
              onClick={() => handleWindowChange('last')}
              disabled={currentWindow === totalWindows - 1}
            >
              Last &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};



export default ECGView;
