import { useState, useEffect } from 'react';

const FileList = ({ ws, isConnected }) => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [transferStatus, setTransferStatus] = useState('');

  useEffect(() => {
    if (!ws) return;

    // Request file list when component mounts and websocket is available
    if (isConnected) {
      console.log('Requesting file list');
      ws.send(JSON.stringify({ type: 'GET_FILE_LIST' }));
    }

    // Handle incoming messages
    const handleMessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('FileList received:', data);

      if (data.type === 'CLIP_LIST') {
        setFiles(data.clips);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, isConnected]);

  return (
    <div className="h-full">
      <h2 className="text-lg font-semibold mb-4">Available Recordings</h2>
      {files.length === 0 ? (
        <p className="text-gray-500">No recordings found</p>
      ) : (
        <div className="space-y-4">
          {files.map((file, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
            >
              <div>
                <p className="font-medium">{file.name}</p>
                <div className="text-sm text-gray-500 space-x-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    Slot {file.slot}
                  </span>
                  <span>Duration: {file.duration || 'Unknown'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileList;
