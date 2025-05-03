import React, { useState, useEffect } from 'react';
import './ClassificationView.css';
import { fetchWithAuth, API_URL } from './utils/api';
import ECGPlot from './ECGPlot';

const ClassificationView = ({ data, prediction,onBack }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [classification, setClassification] = useState(prediction || null);
  const [windowData, setWindowData] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  
  // Classification categories
  const categories = {
    'all': 'All ECGs',
    '0': 'Ventricular fibrillation',
    '1': 'Normal',
    '2': 'Sinus tachycardia',
    '3': 'Ventricular tachycardia',
    '4': 'Polymorphic Ventricular Tachycardia'
  };

  // Map classification numbers to simpler labels for ECGPlot
  const classToLabel = React.useMemo(() => ({
    '0': 'vf',
    '1': 'normal',
    '2': 'st',
    '3': 'vt',
    '4': 'pvt'
  }), []);

  useEffect(() => {
    // Classify the ECG data and preload all windows
    const classifyAndPreloadWindows = async () => {
      try {
        setIsLoading(true);
        
        // Step 1: Classify the ECG (skip if prediction is already provided)
        setLoadingProgress(5);
        
        let classificationResult = prediction;
        console.log("Initial classification data:", classificationResult);
        
        // Only classify if we don't already have a prediction
        if (!classificationResult) {
          // Classify the ECG data
          const classifyResponse = await fetchWithAuth(`${API_URL}/ecg/classify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data })
          });
          
          if (!classifyResponse) {
            throw new Error('Failed to connect to server');
          }
          
          if (!classifyResponse.ok) {
            const errorText = await classifyResponse.text().catch(() => 'Unknown error');
            throw new Error(`Failed to classify ECG: ${classifyResponse.status} ${errorText}`);
          }
          
          classificationResult = await classifyResponse.json();
          console.log("Fresh classification data:", classificationResult);
        } else {
          console.log('Using pre-computed prediction:', classificationResult);
          // Debug: Check if we have window-specific classifications
          if (classificationResult.windows) {
            console.log(`Found ${classificationResult.windows.length} window classifications:`);
            classificationResult.windows.forEach((window, i) => {
              console.log(`  Window ${i}: Class ${window.class !== undefined ? window.class : 'undefined'}`);
            });
          } else {
            console.warn('No window-specific classifications found in prediction data');
          }
          // Skip to 30% since we already have the classification
          setLoadingProgress(30);
        }
        
        setClassification(classificationResult);
        
        // Step 2: Calculate total windows
        const windowSize = 1250;
        const numWindows = Math.ceil(data.length / windowSize);
        setLoadingProgress(40);
        
        // Step 3: Prepare window data
        const windows = [];
        
        for (let i = 0; i < numWindows; i++) {
          setLoadingProgress(40 + Math.floor((i / numWindows) * 60));
          
          const startIdx = i * windowSize;
          const endIdx = Math.min(startIdx + windowSize, data.length);
          const windowData = data.slice(startIdx, endIdx);
          
          // Get the class for this window from classification result if available
          let windowClass = 1; // Default to Normal (class 1)
          
          if (classificationResult && classificationResult.windows && 
              classificationResult.windows[i] && 
              classificationResult.windows[i].class !== undefined) {
            windowClass = classificationResult.windows[i].class;
          }
          
          windows.push({
            window: i,
            data: windowData,
            class: windowClass,
            label: classToLabel[windowClass.toString()] || 'normal'
          });
        }
        
        setWindowData(windows);
        setIsLoading(false);
        setLoadingProgress(100);
        
      } catch (error) {
        console.error('Error in classifyAndPreloadWindows:', error);
        setIsLoading(false);
        
        if (error.message.includes('Failed to connect')) {
          alert('Unable to connect to the server. Please check your connection and try again.');
        } else if (error.message.includes('401')) {
          alert('Your session has expired. Please log in again.');
          localStorage.removeItem('token');
          window.location.reload();
        } else {
          alert(`Error: ${error.message}`);
        }
        
        onBack(); // Return to previous screen on error
      }
    };
    
    classifyAndPreloadWindows();
  }, [data, prediction, onBack, classToLabel]);
  
  // Filter windows based on active tab
  const filteredWindows = activeTab === 'all' 
    ? windowData 
    : windowData.filter(window => window.class.toString() === activeTab);

  return (
    <div className="classification-view-container">
      <div className="classification-header">
        <h2>ECG Classification Results</h2>
        <button className="back-button" onClick={() => {
  console.log('[ClassificationView] Back button pressed, calling onBack');
  onBack();
}}>Back to ECG View</button>
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
        <>
          {classification && classification.class !== undefined && (
            <div className="classification-results">
              <h3>Overall Classification</h3>
              <div className="result-item">
                <span className="result-label">Class:</span>
                <span className="result-value">
                  {categories[classification.class.toString()] || `Class ${classification.class}`}
                </span>
              </div>
              {classification.confidence !== undefined && (
                <div className="result-item">
                  <span className="result-label">Confidence:</span>
                  <span className="result-value">
                    {(classification.confidence * 100).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}
          
          <div className="category-tabs">
            {Object.entries(categories).map(([key, label]) => (
              <button 
                key={key}
                className={`category-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          
          <div className="windows-grid">
            {filteredWindows.map((window, index) => (
              <div key={index} className="window-card">
                <div className="window-header">
                  <span>Window {window.window + 1}</span>
                  <span className={`window-class ${window.label}`}>
                    {window.class !== undefined ? 
                      (categories[window.class.toString()] || `Class ${window.class}`) : 
                      'Unclassified'}
                  </span>
                </div>
                <div className="window-ecg-container">
                  <ECGPlot 
                    data={window.data}
                    windowSize={1250}
                    currentWindow={0}
                    totalWindows={1}
                    showGrid={true}
                    showSampleNumbers={false}
                    height={200}
                    classification={window.label}
                  />
                </div>
              </div>
            ))}
            
            {filteredWindows.length === 0 && (
              <div className="no-results">
                No windows found for this category
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ClassificationView;
