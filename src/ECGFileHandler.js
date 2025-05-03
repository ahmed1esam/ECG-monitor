import { fetchWithAuth, API_URL } from './utils/api';

/**
 * Handles file uploads, parsing, and prediction requests for ECG files.
 * Used by Dashboard for modularity.
 */
export default function handleECGFilesFactory({ onFilesProcessed, setLoading, setProgress }) {
  return async function handleFiles(files) {
    for (const file of files) {
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target.result;
          const data = content.split('\n')
            .map(line => parseFloat(line.trim()))
            .filter(num => !isNaN(num));

          let prediction = null;
          try {
            setLoading(true);
            setProgress(20);
            // First get window classifications
            await fetchWithAuth(`${API_URL}/ecg/classify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data })
            });
            setProgress(60);
            // Then get overall prediction
            const predictResponse = await fetchWithAuth(`${API_URL}/ecg/predict`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data })
            });
            setProgress(90);
            if (predictResponse && predictResponse.ok) {
              prediction = await predictResponse.json();
            }
            setLoading(false);
            setProgress(100);
          } catch (err) {
            setLoading(false);
            setProgress(0);
          }
          onFilesProcessed({ name: file.name, data, prediction });
        };
        reader.readAsText(file);
      } catch (error) {
        setLoading(false);
        setProgress(0);
      }
    }
  }
}
