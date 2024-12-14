// src/components/Dashboard/index.js
import { useState, useEffect, useCallback } from 'react';

const Dashboard = () => {
  const [settings, setSettings] = useState({
    destinationPath: ''
  });
  const [ipAddress, setIpAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDrives, setSelectedDrives] = useState({
    ssd1: false,
    ssd2: false
  });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [transferStatus, setTransferStatus] = useState(null);
  const [ws, setWs] = useState(null);

  // Add this utility function near the top with other functions
  const sanitizePath = (path) => {
    return path.replace(/\/+/g, '/');
  };

  const connectWebSocket = useCallback(() => {
    const socket = new WebSocket('ws://localhost:3001/ws');

    socket.onopen = () => {
      console.log('WebSocket connected successfully');
      setTransferStatus('Connected to server');
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setTransferStatus('Connection error - retrying...');
      setTimeout(() => connectWebSocket(), 5000);
    };

    socket.onclose = () => {
      console.log('WebSocket Disconnected');
      setTransferStatus('Disconnected - retrying...');
      setIsConnected(false);
      setIsMonitoring(false);
      setTimeout(() => connectWebSocket(), 5000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        switch (data.type) {
          case 'CONNECTED':
            setIsConnected(true);
            setTransferStatus({
              message: 'Connected to HyperDeck',
              type: 'success'
            });
            break;
          case 'FILE_TRANSFER':
            setTransferStatus({
              message: `Transferring: ${data.filename}`,
              type: 'info'
            });
            break;
          case 'TRANSFER_COMPLETE':
            setTransferStatus({
              message: `Success! File ${data.filename} has been transferred`,
              type: 'success'
            });
            break;
          case 'MONITORING_STOPPED':
            setTransferStatus({
              message: 'Success, your file has been transferred',
              type: 'success'
            });
            break;
          case 'ERROR':
            setTransferStatus({
              message: `Error: ${data.message}`,
              type: 'error'
            });
            break;
          default:
            // Don't update UI for unknown message types
            console.log('Received message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    setWs(socket);
    return socket;
  }, []);

  useEffect(() => {
    const socket = connectWebSocket();
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [connectWebSocket]);

  const connectToHyperdeck = async () => {
    try {
      if (!ws) throw new Error('WebSocket not connected');
      ws.send(JSON.stringify({
        type: 'CONNECT_HYPERDECK',
        ipAddress
      }));
    } catch (error) {
      console.error('Error connecting to HyperDeck:', error);
      setTransferStatus('Failed to connect to HyperDeck');
    }
  };

  // Updated startWatching function
  const startWatching = async () => {
    try {
      if (!ws) throw new Error('WebSocket not connected');
      if (!settings.destinationPath) throw new Error('Destination path not set');

      setIsMonitoring(true);
      setTransferStatus('Starting monitoring...');

      // Ensure the path is properly formatted
      const sanitizedPath = sanitizePath(settings.destinationPath);

      ws.send(JSON.stringify({
        type: 'START_MONITORING',
        drives: selectedDrives,
        destinationPath: sanitizedPath
      }));
    } catch (error) {
      console.error('Error starting monitoring:', error);
      setTransferStatus('Failed to start monitoring');
      setIsMonitoring(false);
    }
  };

  // Updated stopWatching function
  const stopWatching = async () => {
    try {
      if (ws) {
        const sanitizedPath = sanitizePath(settings.destinationPath);
        
        ws.send(JSON.stringify({
          type: 'FINAL_CHECK',
          drives: selectedDrives,
          destinationPath: sanitizedPath
        }));

        ws.send(JSON.stringify({
          type: 'STOP_MONITORING'
        }));
      }
      setIsMonitoring(false);
      setTransferStatus('Monitoring stopped');
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      setTransferStatus('Error stopping monitoring');
    }
  };

  // Updated handleFolderSelect function
  const handleFolderSelect = async () => {
    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      // Construct the full path
      const fullPath = `/Users/benturner/Desktop/${directoryHandle.name}`;
      
      setSettings(prev => ({
        ...prev,
        destinationPath: fullPath
      }));
      setTransferStatus(`Selected destination folder: ${fullPath}`);
      
      window.selectedDirectory = directoryHandle;
    } catch (error) {
      console.error('Error selecting folder:', error);
      if (error.name === 'SecurityError') {
        setTransferStatus('Please grant permission to access folders');
      } else {
        setTransferStatus('Error selecting destination folder');
      }
    }
  };

  // Rest of your component remains the same
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">HyperRecorder</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Connection Status */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
            <p className={`text-sm p-2 rounded ${
              !transferStatus ? 'text-gray-600' :
              transferStatus.type === 'success' ? 'bg-green-100 text-green-800' :
              transferStatus.type === 'error' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>{transferStatus ? transferStatus.message : (isConnected ? 'Connected' : 'Disconnected')}</p>
          </div>

          {/* IP Address Input */}
          <div className="mb-6">
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="HyperDeck IP Address"
              className="border rounded p-2 w-full mb-2"
              disabled={isConnected}
            />
            <button
              onClick={connectToHyperdeck}
              disabled={isConnected || !ipAddress}
              className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
            >
              Connect to HyperDeck
            </button>
          </div>

          {/* Drive Selection */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Drive Selection</h2>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedDrives.ssd1}
                  onChange={(e) => setSelectedDrives(prev => ({...prev, ssd1: e.target.checked}))}
                  disabled={!isConnected || isMonitoring}
                  className="mr-2"
                />
                SSD 1
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedDrives.ssd2}
                  onChange={(e) => setSelectedDrives(prev => ({...prev, ssd2: e.target.checked}))}
                  disabled={!isConnected || isMonitoring}
                  className="mr-2"
                />
                SSD 2
              </label>
            </div>
          </div>

          {/* Destination Folder */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Destination Folder</h2>
            <div className="flex items-center">
              <input
                type="text"
                value={settings.destinationPath}
                className="border rounded p-2 flex-1 mr-2"
                readOnly
                placeholder="Select destination folder"
              />
              <button
                onClick={handleFolderSelect}
                disabled={!isConnected || isMonitoring}
                className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Settings */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Settings</h2>
            <input
              type="text"
              value={settings.destinationPath}
              onChange={(e) => setSettings(prev => ({...prev, destinationPath: e.target.value}))}
              placeholder="Destination Path"
              className="border rounded p-2 w-full"
              disabled={!isConnected || isMonitoring}
            />
          </div>

          {/* Start/Stop Button */}
          <button
            onClick={isMonitoring ? stopWatching : startWatching}
            disabled={!isConnected || !settings.destinationPath}
            className={`${
              isMonitoring ? 'bg-red-500' : 'bg-green-500'
            } text-white px-4 py-2 rounded disabled:bg-gray-300`}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;