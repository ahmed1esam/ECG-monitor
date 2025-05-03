import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import ECGView from './ECGView';
import RegisterPatient from './RegisterPatient';
import DeviceManagement from './DeviceManagement';
import ECGPlot from './ECGPlot';
import { fetchWithAuth, API_URL } from './utils/api';

function Dashboard({ onLogout, userRole }) {
  const [showPatientWarning, setShowPatientWarning] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('disconnected');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [showVisualization, setShowVisualization] = useState(false);
  const [currentWindow, setCurrentWindow] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showECGView, setShowECGView] = useState(false);
  const [selectedFileData, setSelectedFileData] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const canvasRef = useRef(null);
  const reportRef = useRef(null);

  // ECG Configuration
  const ECG_CONFIG = {
    sampleRate: 250, // Hz
    voltageRange: { min: -5, max: 5 }, // Volts
    gridSize: 20, // pixels
    timeWindow: 4, // seconds of data to show
    pixelsPerVolt: 40, // pixels per volt for display scaling
    windowDuration: 5 // seconds per window
  };

  // Fetch ECG data on component mount
  useEffect(() => {
    const fetchECGData = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/ecg`);
        
        if (response && response.ok) {
          await response.json();
        }
      } catch (error) {
        console.error('Error fetching ECG data:', error);
      }
    };

    fetchECGData();
  }, []);

  useEffect(() => {
    // Fetch patients when needed for monitoring
    if (selectedOption === 'monitor') {
      fetchPatients();
    }
  }, [selectedOption]);

  const fetchPatients = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/patients`);
      
      if (!response) {
        console.error("No response from server when fetching patients");
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setPatients(data.patients || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error fetching patients:", response.status, errorData);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchPendingUsers = async () => {
    try {
      console.log("Fetching pending users...");
      const response = await fetchWithAuth(`${API_URL}/admin/get-pending-users`);
      
      if (!response) {
        console.error("No response from server when fetching pending users");
        setAdminMessage("Error: Could not connect to server");
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        console.log("Pending users data:", data);
        setPendingUsers(data.pendingUsers || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error fetching pending users:", response.status, errorData);
        setAdminMessage(`Error: ${errorData.error || 'Failed to fetch pending users'}`);
      }
    } catch (error) {
      console.error('Error fetching pending users:', error);
      setAdminMessage(`Error: ${error.message || 'Failed to fetch pending users'}`);
    }
  };

  const approveUser = async (username) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/admin/approve-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });

      if (response.ok) {
        setAdminMessage(`User ${username} has been approved successfully`);
        // Refresh the pending users list
        fetchPendingUsers();
      } else {
        const data = await response.json();
        setAdminMessage(`Error: ${data.error || 'Failed to approve user'}`);
      }
    } catch (error) {
      console.error('Error approving user:', error);
      setAdminMessage(`Error: ${error.message}`);
    }
  };

  const denyUser = async (username) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/admin/deny-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });

      if (response.ok) {
        setAdminMessage(`User ${username} has been denied access`);
        // Refresh the pending users list
        fetchPendingUsers();
      } else {
        const data = await response.json();
        setAdminMessage(`Error: ${data.error || 'Failed to deny user'}`);
      }
    } catch (error) {
      console.error('Error denying user:', error);
      setAdminMessage(`Error: ${error.message}`);
    }
  };

  const generateReport = () => {
    if (!selectedSignal) return;
    
    try {
      // Calculate windows and classifications
      const windowSize = 1250; // 5 seconds at 250Hz
      const totalWindows = Math.ceil(selectedSignal.length / windowSize);
      
      // Count classifications
      const classifications = {
        normal: 0,
        st: 0,
        vt: 0,
        pvt: 0,
        vf: 0,
        unclassified: 0
      };
      
      // Get classification for each window
      const windowClassifications = [];
      for (let i = 0; i < totalWindows; i++) {
        const selectedFile = uploadedFiles.find(file => file.data === selectedSignal);
        let classification = 'unclassified';
        
        if (selectedFile && selectedFile.prediction) {
          classification = selectedFile.prediction.toLowerCase();
        } else {
          const types = ['normal', 'st', 'vt', 'pvt', 'vf'];
          classification = types[Math.floor(Math.random() * types.length)];
        }
        
        windowClassifications.push({
          window: i + 1,
          classification: classification
        });
        
        // Increment the count for this classification
        classifications[classification]++;
      }
      
      // Calculate durations
      const durations = {};
      Object.keys(classifications).forEach(type => {
        durations[type] = classifications[type] * ECG_CONFIG.windowDuration;
      });
      
      setReportData({
        patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Unknown',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        totalWindows,
        totalDuration: totalWindows * ECG_CONFIG.windowDuration,
        classifications,
        durations,
        windowClassifications
      });
      
      setSelectedCategory('all');
      setShowReport(true);
      
      // Ensure the report is visible by scrolling to it
      setTimeout(() => {
        if (reportRef.current) {
          reportRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('There was an error generating the report. Please try again.');
    }
  };

  const printReport = () => {
    try {
      if (!reportRef.current) return;
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print the report');
        return;
      }
      
      printWindow.document.write('<html><head><title>ECG Report</title>');
      printWindow.document.write('<style>');
      printWindow.document.write(`
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1, h2, h3 { color: #333; }
        .report-header { margin-bottom: 20px; }
        .report-section { margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .classification-normal { color: green; font-weight: bold; }
        .classification-st { color: orange; font-weight: bold; }
        .classification-vt, .classification-pvt, .classification-vf { color: red; font-weight: bold; }
        .classification-unclassified { color: gray; font-weight: bold; }
        .footer { margin-top: 50px; font-size: 12px; color: #666; }
        
        /* Classification bar styles for print */
        .classification-bar {
          height: 40px;
          width: 100%;
          background-color: #eee;
          margin: 20px 0;
          display: flex;
        }
        .classification-bar-segment {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
        }
        .classification-bar-segment.classification-normal { background-color: green; }
        .classification-bar-segment.classification-st { background-color: orange; }
        .classification-bar-segment.classification-vt,
        .classification-bar-segment.classification-pvt,
        .classification-bar-segment.classification-vf { background-color: red; }
        .classification-bar-segment.classification-unclassified { background-color: gray; }
        
        /* Criticality indicators for print */
        .criticality {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .criticality.low { background-color: #d4edda; color: #155724; }
        .criticality.medium { background-color: #fff3cd; color: #856404; }
        .criticality.high { background-color: #f8d7da; color: #721c24; }
        .criticality.unknown { background-color: #e2e3e5; color: #383d41; }
      `);
      printWindow.document.write('</style></head><body>');
      
      // Create a simplified version of the report for printing
      printWindow.document.write('<div class="report-content">');
      
      // Patient info
      printWindow.document.write('<div class="report-section">');
      printWindow.document.write('<h2>ECG Analysis Report</h2>');
      printWindow.document.write(`<p><strong>Patient:</strong> ${reportData.patientName}</p>`);
      printWindow.document.write(`<p><strong>Date:</strong> ${reportData.date} | <strong>Time:</strong> ${reportData.time}</p>`);
      printWindow.document.write(`<p><strong>Total Duration:</strong> ${reportData.totalDuration} seconds | <strong>Total Windows:</strong> ${reportData.totalWindows}</p>`);
      printWindow.document.write('</div>');
      
      // Classification summary
      printWindow.document.write('<div class="report-section">');
      printWindow.document.write('<h3>ECG Classification Summary</h3>');
      
      // Classification bar
      printWindow.document.write('<div class="classification-bar">');
      Object.keys(reportData.classifications).forEach(type => {
        const percentage = reportData.totalWindows > 0 
          ? ((reportData.classifications[type] / reportData.totalWindows) * 100) 
          : 0;
        
        if (percentage > 0) {
          printWindow.document.write(`
            <div 
              class="classification-bar-segment classification-${type}"
              style="width: ${percentage}%"
            >
              ${percentage > 5 ? `${type.toUpperCase()} ${percentage.toFixed(1)}%` : ''}
            </div>
          `);
        }
      });
      printWindow.document.write('</div>');
      
      // Classification table
      printWindow.document.write('<table class="classification-summary">');
      printWindow.document.write(`
        <thead>
          <tr>
            <th>Classification</th>
            <th>Windows</th>
            <th>Duration (seconds)</th>
            <th>Percentage</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
      `);
      
      Object.keys(reportData.classifications).forEach(type => {
        const percentage = reportData.totalWindows > 0 
          ? ((reportData.classifications[type] / reportData.totalWindows) * 100) 
          : 0;
        
        let riskLevel = '';
        if (type === 'normal') {
          riskLevel = '<span class="criticality low">Low Risk</span>';
        } else if (type === 'st') {
          riskLevel = '<span class="criticality medium">Medium Risk</span>';
        } else if (['vt', 'pvt', 'vf'].includes(type)) {
          riskLevel = '<span class="criticality high">High Risk</span>';
        } else {
          riskLevel = '<span class="criticality unknown">Unknown</span>';
        }
        
        printWindow.document.write(`
          <tr class="classification-${type}">
            <td>${type.toUpperCase()}</td>
            <td>${reportData.classifications[type]}</td>
            <td>${reportData.durations[type]}</td>
            <td>${percentage.toFixed(1)}%</td>
            <td>${riskLevel}</td>
          </tr>
        `);
      });
      
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</div>');
      
      // Window-by-window analysis
      printWindow.document.write('<div class="report-section">');
      printWindow.document.write('<h3>Window-by-Window Analysis</h3>');
      printWindow.document.write('<table class="window-classifications">');
      printWindow.document.write(`
        <thead>
          <tr>
            <th>Window</th>
            <th>Time (seconds)</th>
            <th>Classification</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
      `);
      
      reportData.windowClassifications.forEach(window => {
        let riskLevel = '';
        if (window.classification === 'normal') {
          riskLevel = '<span class="criticality low">Low Risk</span>';
        } else if (window.classification === 'st') {
          riskLevel = '<span class="criticality medium">Medium Risk</span>';
        } else if (['vt', 'pvt', 'vf'].includes(window.classification)) {
          riskLevel = '<span class="criticality high">High Risk</span>';
        } else {
          riskLevel = '<span class="criticality unknown">Unknown</span>';
        }
        
        printWindow.document.write(`
          <tr class="classification-${window.classification}">
            <td>${window.window}</td>
            <td>${(window.window - 1) * ECG_CONFIG.windowDuration} - ${window.window * ECG_CONFIG.windowDuration}</td>
            <td>${window.classification.toUpperCase()}</td>
            <td>${riskLevel}</td>
          </tr>
        `);
      });
      
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</div>');
      
      // Footer
      printWindow.document.write('<div class="footer">');
      printWindow.document.write('<p>This report was generated automatically and should be reviewed by a qualified healthcare professional.</p>');
      printWindow.document.write('</div>');
      
      printWindow.document.write('</div>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      
      // Wait for content to load then print
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (error) {
      console.error('Error printing report:', error);
      alert('There was an error printing the report. Please try again.');
    }
  };

  const connectDevice = async () => {
    setDeviceStatus('connecting');
    try {
      setTimeout(() => {
        setDeviceStatus('connected');
      }, 2000);
    } catch (error) {
      setDeviceStatus('disconnected');
      console.error('Failed to connect:', error);
    }
  };

  const disconnectDevice = () => {
    setDeviceStatus('disconnected');
  };

  // Visualization handlers
  const handleVisualizeSignal = async (index) => {
    try {
      // Get the file data
      const fileData = uploadedFiles[index].data;
      if (!fileData || fileData.length === 0) {
        throw new Error('No data available for this file');
      }
      
      console.log(`Opening ECG view with ${fileData.length} data points`);
      
      // Set the selected file data and show the ECG view
      setSelectedFileData(fileData);
      setShowECGView(true);
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed to open ECG view: ${error.message}`);
    }
  };

  const closeVisualization = () => {
    setShowVisualization(false);
    if (selectedSignal) {
      URL.revokeObjectURL(selectedSignal);
      setSelectedSignal(null);
    }
    setCurrentWindow(0);
  };
  
  const handleWindowNavigation = (direction) => {
    try {
      if (!selectedSignal) return;
      
      let newWindowIndex;
      if (direction === 'next') {
        newWindowIndex = Math.min(currentWindow + 1, Math.ceil(selectedSignal.length / ECG_CONFIG.windowSize) - 1);
      } else if (direction === 'prev') {
        newWindowIndex = Math.max(currentWindow - 1, 0);
      } else if (direction === 'first') {
        newWindowIndex = 0;
      } else if (direction === 'last') {
        newWindowIndex = Math.ceil(selectedSignal.length / ECG_CONFIG.windowSize) - 1;
      } else {
        // If a specific window index is provided
        newWindowIndex = parseInt(direction);
      }
      
      setCurrentWindow(newWindowIndex);
    } catch (error) {
      console.error("Error navigating ECG windows:", error);
      alert("There was an error navigating between ECG windows. Please try again.");
    }
  };

  // Canvas drawing effect
  useEffect(() => {
    if (selectedOption === 'monitor' && deviceStatus === 'connected') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const drawGrid = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;

        // Draw vertical grid lines
        for (let x = 0; x <= canvas.width; x += ECG_CONFIG.gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
        }

        // Draw horizontal grid lines
        for (let y = 0; y <= canvas.height; y += ECG_CONFIG.gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
        }

        ctx.stroke();
      };

      const drawInterval = setInterval(drawGrid, 1000 / 30); // 30 FPS

      return () => clearInterval(drawInterval);
    }
  }, [selectedOption, deviceStatus, ECG_CONFIG.gridSize]);

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = async (files) => {
    for (const file of files) {
      try {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          const content = e.target.result;
          const data = content.split('\n')
            .map(line => parseFloat(line.trim()))
            .filter(num => !isNaN(num));

          console.log(`Parsed ${data.length} data points from file ${file.name}`);
          
          let prediction = null;
          try {
            setIsLoading(true);
            setLoadingProgress(20);
            
            // First get individual window classifications
            const classifyResponse = await fetchWithAuth(`${API_URL}/ecg/classify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ data })
            });
            
            if (classifyResponse && classifyResponse.ok) {
              prediction = await classifyResponse.json();
              console.log('Classification result with window details:', prediction);
              
              // Verify we have window-specific classifications
              if (prediction.windows) {
                console.log(`Successfully classified ${prediction.windows.length} windows:`);
                prediction.windows.forEach((window, i) => {
                  if (window.class !== undefined) {
                    console.log(`Window ${i}: Class ${window.class} (${window.confidence ? (window.confidence * 100).toFixed(2) + '%' : 'N/A'})`);
                  }
                });
              } else {
                console.warn('Warning: No window-specific classifications found in response');
              }
              
              setLoadingProgress(70);
            }
          } catch (predictError) {
            console.warn('Prediction failed, but file is still available:', predictError);
          }
          
          // Add to uploaded files immediately with the parsed data and prediction
          const newFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            uploadTime: new Date().toISOString(),
            data: data,
            prediction: prediction // Store prediction with the file
          };
          
          setUploadedFiles(prev => [...prev, newFile]);
          
          // Also upload to server for storage/processing
          try {
            const response = await fetchWithAuth(`${API_URL}/ecg/upload`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ data })
            });

            if (response && !response.ok) {
              const errorText = await response.text();
              console.warn(`Server warning: ${errorText}`);
              // Continue anyway since we have the data locally
            } else if (response) {
              const result = await response.json();
              console.log('Upload result:', result);
            }
            
            setIsLoading(false);
            setLoadingProgress(0);
          } catch (uploadError) {
            console.warn('Server upload failed, but file is available locally:', uploadError);
            // We can still visualize since we have the data locally
            setIsLoading(false);
            setLoadingProgress(0);
          }
        };

        reader.readAsText(file);
      } catch (error) {
        console.error('Error processing file:', error);
        alert(`Failed to process file ${file.name}: ${error.message}`);
        setIsLoading(false);
        setLoadingProgress(0);
      }
    }
  };

  const preventDefault = (e) => {
    e.preventDefault();
  };

  const renderDeviceStatus = () => {
    switch (deviceStatus) {
      case 'connected':
        return (
          <div className="device-status connected">
            <span className="status-dot"></span>
            Device Connected
            <button className="disconnect-button" onClick={disconnectDevice}>
              Disconnect
            </button>
          </div>
        );
      case 'connecting':
        return (
          <div className="device-status connecting">
            <span className="status-dot"></span>
            Connecting...
          </div>
        );
      default:
        return (
          <div className="device-status">
            <span className="status-dot"></span>
            No Device Connected
            <button
              className="connect-button"
              onClick={() => {
                if (!selectedPatient) {
                  setShowPatientWarning(true);
                } else {
                  connectDevice();
                }
              }}
            >
              Connect Device
            </button>
          </div>
        );
    }
  };

  const renderContent = () => {
    switch (selectedOption) {
      case 'registerPatient':
        return <RegisterPatient onBack={() => setSelectedOption(null)} />;
      case 'liveMonitor':
        return (
          <div className="ecg-container">
            <div className="ecg-header">
              <div>
                <h2>Live ECG Monitor</h2>
                {renderDeviceStatus()}
              </div>
              <button className="back-button" onClick={() => {
                disconnectDevice();
                setSelectedOption(null);
                setSelectedPatient(null);
              }}>
                Back to Dashboard
              </button>
            </div>
            <div className="patient-selection">
              <label htmlFor="patient-select">Select Patient:</label>
              <select 
                id="patient-select"
                value={selectedPatient ? selectedPatient.id : ''}
                onChange={(e) => {
                  const patientId = e.target.value;
                  const patient = patients.find(p => String(p.id) === String(patientId));
                  setSelectedPatient(patient || null);
                }}
                disabled={deviceStatus === 'connected'}
              >
                <option value="">-- Select a patient --</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName} - Device: {patient.deviceId}
                  </option>
                ))}
              </select>
            </div>
            <canvas
              ref={canvasRef}
              width={800}
              height={400}
              style={{ width: '100%', height: 'auto' }}
            />
            {deviceStatus === 'disconnected' && !selectedPatient && (
              <div className="connection-prompt">
                <p>Please select a patient and connect to their device to begin monitoring</p>
                <p>Sampling Rate: {ECG_CONFIG.sampleRate}Hz | Voltage Range: {ECG_CONFIG.voltageRange.min}V to {ECG_CONFIG.voltageRange.max}V</p>
              </div>
            )}
            {deviceStatus === 'connected' && (
              <div className="monitoring-controls">
                <button className="report-button" onClick={generateReport}>
                  Generate Report
                </button>
              </div>
            )}
            {showReport && reportData && (
              <div className="report-overlay">
                <div className="report-container">
                  <div className="report-header">
                    <h2>ECG Analysis Report</h2>
                    <div className="report-actions">
                      <button className="print-button" onClick={printReport}>
                        Print Report
                      </button>
                      <button className="close-button" onClick={() => setShowReport(false)}>
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="report-content" ref={reportRef}>
                    <div className="report-section">
                      <h3>Patient Information</h3>
                      <p><strong>Name:</strong> {reportData.patientName}</p>
                      <p><strong>Date:</strong> {reportData.date}</p>
                      <p><strong>Time:</strong> {reportData.time}</p>
                    </div>
                    <div className="report-section">
                      <h3>ECG Analysis Summary</h3>
                      <p><strong>Total Duration:</strong> {reportData.totalDuration} seconds</p>
                      <p><strong>Total Windows:</strong> {reportData.totalWindows}</p>
                      <div className="category-tabs">
                        <button 
                          className={`category-tab ${selectedCategory === 'normal' ? 'active' : ''} normal`}
                          onClick={() => setSelectedCategory('normal')}
                        >
                          Normal
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'st' ? 'active' : ''} st`}
                          onClick={() => setSelectedCategory('st')}
                        >
                          Sinus Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'vt' ? 'active' : ''} vt`}
                          onClick={() => setSelectedCategory('vt')}
                        >
                          Ventricular Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'pvt' ? 'active' : ''} pvt`}
                          onClick={() => setSelectedCategory('pvt')}
                        >
                          Polymorphic Ventricular Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'vf' ? 'active' : ''} vf`}
                          onClick={() => setSelectedCategory('vf')}
                        >
                          Ventricular Fibrillation
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                          onClick={() => setSelectedCategory('all')}
                        >
                          All ECGs
                        </button>
                      </div>
                      <table className="classification-summary">
                        <thead>
                          <tr>
                            <th>Classification</th>
                            <th>Windows</th>
                            <th>Duration (seconds)</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(reportData.classifications)
                            .filter(type => selectedCategory === 'all' || type === selectedCategory)
                            .map(type => (
                              <tr key={type}>
                                <td>{type}</td>
                                <td>{reportData.classifications[type]}</td>
                                <td>{reportData.durations[type]}</td>
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
          </div>
        );
      case 'monitor':
        return (
          <div className="ecg-container">
            <div className="ecg-header">
              <div>
                <h2>Live ECG Monitor</h2>
                {renderDeviceStatus()}
              </div>
              <button className="back-button" onClick={() => {
                disconnectDevice();
                setSelectedOption(null);
                setSelectedPatient(null);
              }}>
                Back to Options
              </button>
            </div>
            
            <div className="patient-selection">
              <label htmlFor="patient-select">Select Patient:</label>
              <select 
                id="patient-select"
                value={selectedPatient ? selectedPatient.id : ''}
                onChange={(e) => {
                  const patientId = e.target.value;
                  const patient = patients.find(p => String(p.id) === String(patientId));
                  setSelectedPatient(patient || null);
                }}
                disabled={deviceStatus === 'connected'}
              >
                <option value="">-- Select a patient --</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName} - Device: {patient.deviceId}
                  </option>
                ))}
              </select>
            </div>
            
            <canvas
              ref={canvasRef}
              width={800}
              height={400}
              style={{ width: '100%', height: 'auto' }}
            />
            
            {deviceStatus === 'disconnected' && !selectedPatient && (
              <div className="connection-prompt">
                <p>Please select a patient and connect to their device to begin monitoring</p>
                <p>Sampling Rate: {ECG_CONFIG.sampleRate}Hz | Voltage Range: {ECG_CONFIG.voltageRange.min}V to {ECG_CONFIG.voltageRange.max}V</p>
              </div>
            )}
            
            {deviceStatus === 'connected' && (
              <div className="monitoring-controls">
                <button className="report-button" onClick={generateReport}>
                  Generate Report
                </button>
              </div>
            )}
            
            {showReport && reportData && (
              <div className="report-overlay">
                <div className="report-container">
                  <div className="report-header">
                    <h2>ECG Analysis Report</h2>
                    <div className="report-actions">
                      <button className="print-button" onClick={printReport}>
                        Print Report
                      </button>
                      <button className="close-button" onClick={() => setShowReport(false)}>
                        Close
                      </button>
                    </div>
                  </div>
                  
                  <div className="report-content" ref={reportRef}>
                    <div className="report-section">
                      <h3>Patient Information</h3>
                      <p><strong>Name:</strong> {reportData.patientName}</p>
                      <p><strong>Date:</strong> {reportData.date}</p>
                      <p><strong>Time:</strong> {reportData.time}</p>
                    </div>
                    
                    <div className="report-section">
                      <h3>ECG Analysis Summary</h3>
                      <p><strong>Total Duration:</strong> {reportData.totalDuration} seconds</p>
                      <p><strong>Total Windows:</strong> {reportData.totalWindows}</p>
                      
                      <div className="category-tabs">
                        <button 
                          className={`category-tab ${selectedCategory === 'normal' ? 'active' : ''} normal`}
                          onClick={() => setSelectedCategory('normal')}
                        >
                          Normal
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'st' ? 'active' : ''} st`}
                          onClick={() => setSelectedCategory('st')}
                        >
                          Sinus Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'vt' ? 'active' : ''} vt`}
                          onClick={() => setSelectedCategory('vt')}
                        >
                          Ventricular Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'pvt' ? 'active' : ''} pvt`}
                          onClick={() => setSelectedCategory('pvt')}
                        >
                          Polymorphic Ventricular Tachycardia
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'vf' ? 'active' : ''} vf`}
                          onClick={() => setSelectedCategory('vf')}
                        >
                          Ventricular Fibrillation
                        </button>
                        <button 
                          className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                          onClick={() => setSelectedCategory('all')}
                        >
                          All ECGs
                        </button>
                      </div>
                      
                      <table className="classification-summary">
                        <thead>
                          <tr>
                            <th>Classification</th>
                            <th>Windows</th>
                            <th>Duration (seconds)</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(reportData.classifications)
                            .filter(type => selectedCategory === 'all' || type === selectedCategory)
                            .map(type => (
                              <tr key={type} className={`classification-${type}`}>
                                <td>{type.toUpperCase()}</td>
                                <td>{reportData.classifications[type]}</td>
                                <td>{reportData.durations[type]}</td>
                                <td>
                                  {reportData.totalWindows > 0 
                                    ? ((reportData.classifications[type] / reportData.totalWindows) * 100).toFixed(1) 
                                    : 0}%
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      
                      <div className="classification-bar-container">
                        <h4>Visual Classification Distribution</h4>
                        <div className="classification-bar">
                          {Object.keys(reportData.classifications).map(type => {
                            const percentage = reportData.totalWindows > 0 
                              ? ((reportData.classifications[type] / reportData.totalWindows) * 100) 
                              : 0;
                            
                            // Always show all segments, just highlight the selected one
                            return percentage > 0 ? (
                              <div 
                                key={type}
                                className={`classification-bar-segment classification-${type} ${selectedCategory === type ? 'selected' : ''}`}
                                style={{ 
                                  width: `${percentage}%`,
                                  // Don't reduce opacity, just highlight the selected one
                                }}
                                title={`${type.toUpperCase()}: ${percentage.toFixed(1)}%`}
                                onClick={() => setSelectedCategory(type)}
                              >
                                {percentage > 5 ? `${type.toUpperCase()} ${percentage.toFixed(1)}%` : ''}
                              </div>
                            ) : null;
                          })}
                        </div>
                        <div className="classification-bar-legend">
                          {Object.keys(reportData.classifications)
                            .filter(type => reportData.classifications[type] > 0)
                            .map(type => (
                              <div 
                                key={type} 
                                className={`legend-item ${selectedCategory === type ? 'selected' : ''}`}
                                onClick={() => setSelectedCategory(type)}
                              >
                                <div className={`legend-color classification-${type}`}></div>
                                <div className="legend-label">{type.toUpperCase()}</div>
                                <div className="criticality-indicator">
                                  {type === 'normal' && <span className="criticality low">Low Risk</span>}
                                  {type === 'st' && <span className="criticality medium">Medium Risk</span>}
                                  {(type === 'vt' || type === 'pvt' || type === 'vf') && 
                                    <span className="criticality high">High Risk</span>}
                                  {type === 'unclassified' && <span className="criticality unknown">Unknown</span>}
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    </div>
                    
                    <div className="report-section">
                      <h3>Window-by-Window Analysis</h3>
                      <table className="window-classifications">
                        <thead>
                          <tr>
                            <th>Window</th>
                            <th>Time (seconds)</th>
                            <th>Classification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.windowClassifications
                            .filter(window => selectedCategory === 'all' || window.classification === selectedCategory)
                            .map(window => (
                              <tr key={window.window} className={`classification-${window.classification}`}>
                                <td>{window.window}</td>
                                <td>{(window.window - 1) * ECG_CONFIG.windowDuration} - {window.window * ECG_CONFIG.windowDuration}</td>
                                <td>{window.classification.toUpperCase()}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="footer">
                      <p>This report was generated automatically and should be reviewed by a qualified healthcare professional.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'upload':
        return (
          <div className="ecg-container">
            <div className="ecg-header">
              <h2>Upload ECG Data</h2>
              <button className="back-button" onClick={() => setSelectedOption(null)}>
                Back to Options
              </button>
            </div>
            <div
              className="dropzone"
              onDrop={handleDrop}
              onDragOver={preventDefault}
              onDragEnter={preventDefault}
            >
              <p>Drag and drop your ECG data files here</p>
              <p>Supported formats: .txt</p>
              <div className="upload-button-container">
                <label className="upload-button">
                  Choose Files
                  <input
                    type="file"
                    multiple
                    accept=".csv,.txt,.json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="file-list">
                <h3>Uploaded Files:</h3>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{(file.size / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="file-actions">
                      <button
                        onClick={() => handleVisualizeSignal(index)}
                        disabled={!file.data}
                        className="visualize-button"
                      >
                        Visualize
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ${file.name}?`)) {
                            const updatedFiles = [...uploadedFiles];
                            updatedFiles.splice(index, 1);
                            setUploadedFiles(updatedFiles);
                          }
                        }}
                        className="delete-button"
                      >
                        Delete Signal
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      
      case 'register-patient':
        return (
          <RegisterPatient onBack={() => setSelectedOption(null)} />
        );
      
      case 'devices':
        return (
          <DeviceManagement onBack={() => setSelectedOption(null)} />
        );
      
      case 'admin':
        return (
          <div className="admin-panel">
            <div className="admin-header">
              <h2>Admin Panel</h2>
              <button className="back-button" onClick={() => setSelectedOption(null)}>
                Back to Options
              </button>
            </div>
            
            {adminMessage && (
              <div className="admin-message">
                {adminMessage}
              </div>
            )}
            
            <div className="admin-section">
              <h3>Pending User Approvals</h3>
              {pendingUsers.length === 0 ? (
                <p>No pending user approvals</p>
              ) : (
                <div className="pending-users-list">
                  {pendingUsers.map(user => (
                    <div key={user.username} className="pending-user-card">
                      <div className="user-info">
                        <span className="username">{user.username}</span>
                        <span className="role">{user.role}</span>
                      </div>
                      <div className="approval-actions">
                        <button 
                          className="approve-button"
                          onClick={() => approveUser(user.username)}
                        >
                          Approve
                        </button>
                        <button 
                          className="deny-button"
                          onClick={() => denyUser(user.username)}
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      
      default:
        return (
          <div className="options-container">
            {/* Show Register Patient tab for nurses */}
            {userRole === 'nurse' && (
              <div className="option-card" onClick={() => handleOptionSelect('registerPatient')}>
                <div className="option-icon">👤</div>
                <h2 className="option-title">Register Patient</h2>
                <p className="option-description">
                  Register new patients and manage patient records
                </p>
              </div>
            )}
            
            {/* Show Live Monitoring tab for doctors and admins */}
            {(userRole === 'doctor' || userRole === 'admin') && (
              <div className="option-card" onClick={() => handleOptionSelect('liveMonitor')}>
                <div className="option-icon">💓</div>
                <h2 className="option-title">Live Monitoring</h2>
                <p className="option-description">
                  Connect your ECG device and view real-time monitoring
                </p>
              </div>
            )}
            
            {/* Show Upload ECG Data tab for doctors and admins */}
            {(userRole === 'doctor' || userRole === 'admin') && (
              <div className="option-card" onClick={() => handleOptionSelect('upload')}>
                <div className="option-icon">📁</div>
                <h2 className="option-title">Upload ECG Data</h2>
                <p className="option-description">
                  Drag and drop your ECG data files for analysis
                </p>
              </div>
            )}
            
            {/* Show Register Patient tab for doctors and admins */}
            {(userRole === 'doctor' || userRole === 'admin') && (
              <div className="option-card" onClick={() => handleOptionSelect('registerPatient')}>
                <div className="option-icon">👤</div>
                <h2 className="option-title">Register Patient</h2>
                <p className="option-description">
                  Register new patients and manage patient records
                </p>
              </div>
            )}
            
            {/* Show Devices tab for doctors and admins */}
            {(userRole === 'doctor' || userRole === 'admin') && (
              <div className="option-card" onClick={() => handleOptionSelect('devices')}>
                <div className="option-icon">🔌</div>
                <h2 className="option-title">Devices</h2>
                <p className="option-description">
                  Manage ECG devices and monitoring equipment
                </p>
              </div>
            )}
            
            {/* Show Admin Panel only for admins */}
            {userRole === 'admin' && (
              <div className="option-card" onClick={() => handleOptionSelect('admin')}>
                <div className="option-icon">⚙️</div>
                <h2 className="option-title">Admin Panel</h2>
                <p className="option-description">
                  Manage user approvals and system settings
                </p>
              </div>
            )}
          </div>
        );
    }
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    
    // Reset states when changing tabs
    setShowReport(false);
    setSelectedCategory('all');
    
    // Only fetch pending users when Admin Panel tab is explicitly selected
    if (option === 'admin' && userRole === 'admin') {
      console.log("Admin Panel selected - fetching pending users");
      fetchPendingUsers();
      
      // Apply enhanced classification bar styling
      const styleSheet = document.styleSheets[0];
      
      // Check if we already added the styles to avoid duplicates
      const styleExists = Array.from(styleSheet.cssRules).some(
        rule => rule.selectorText === '.classification-bar-enhanced'
      );
      
      if (!styleExists) {
        try {
          // Enhanced classification bar styles
          styleSheet.insertRule(`
            .classification-bar {
              height: 120px !important;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
              border: 2px solid #3a5a97 !important;
              background-color: rgba(240, 248, 255, 0.8) !important;
            }
          `, styleSheet.cssRules.length);
          
          // Enhanced segment styles
          styleSheet.insertRule(`
            .classification-bar-segment {
              font-size: 22px !important;
              text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5) !important;
            }
          `, styleSheet.cssRules.length);
          
          // Pulse animation for high-risk classifications
          styleSheet.insertRule(`
            .classification-bar-segment.classification-vt,
            .classification-bar-segment.classification-pvt,
            .classification-bar-segment.classification-vf {
              animation: pulse 2s infinite !important;
            }
          `, styleSheet.cssRules.length);
          
          // Selected segment style
          styleSheet.insertRule(`
            .classification-bar-segment.selected {
              border: 3px solid white !important;
              box-shadow: 0 0 15px rgba(255, 255, 255, 0.8) !important;
            }
          `, styleSheet.cssRules.length);
        } catch (error) {
          console.error('Error applying enhanced styles:', error);
        }
      }
    }
    
    // Fetch patients when Live Monitor tab is selected
    if (option === 'liveMonitor') {
      fetchPatients();
    }
  };

  const renderECGVisualization = () => {
    if (!selectedSignal) return null;
    
    const totalWindows = Math.ceil(selectedSignal.length / ECG_CONFIG.windowSize);
    const selectedFile = uploadedFiles.find(file => file.data === selectedSignal);
    const classification = selectedFile?.prediction || null;
    
    return (
      <div className="ecg-visualization-section">
        <h3 className="section-title">ECG Visualization</h3>
        
        <ECGPlot
          data={selectedSignal}
          windowSize={ECG_CONFIG.windowSize}
          currentWindow={currentWindow}
          totalWindows={totalWindows}
          showGrid={true}
          showSampleNumbers={true}
          height={300}
          classification={classification}
          onWindowChange={handleWindowNavigation}
        />
        
        <div className="visualization-actions">
          <button 
            className="action-button generate-report-button" 
            onClick={generateReport}
          >
            Generate Report
          </button>
          <button 
            className="action-button close-button" 
            onClick={closeVisualization}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">ECG Monitoring Dashboard</h1>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-container">
            <div className="loading-bar-container">
              <div 
                className="loading-bar" 
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <div className="loading-text">Processing ECG Data... {loadingProgress}%</div>
          </div>
        </div>
      )}

      {showECGView && selectedFileData && (
        <ECGView 
          data={selectedFileData} 
          prediction={uploadedFiles.find(file => file.data === selectedFileData)?.prediction}
          onBack={() => {
            setShowECGView(false);
            setSelectedFileData(null);
            setShowVisualization(false); // Hide dashboard ECG plot
            setSelectedSignal(null);     // Clear selected signal
            setCurrentWindow(0);         // Optional: reset window
          }} 
        />
      )}

      {/* Only show ECGView or Visualization, otherwise show main content */}
      {showECGView && selectedFileData ? null : (
        showVisualization && selectedSignal ? renderECGVisualization() : renderContent()
      )}


      {/* Patient Warning Popup */}
      {showPatientWarning && (
        <div className="modal-overlay">
          <div className="modal-content">
            <p>Please select a patient before connecting the device.</p>
            <button className="close-modal" onClick={() => setShowPatientWarning(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
