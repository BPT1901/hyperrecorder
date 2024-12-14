// FileList/index.js
import { useState, useEffect } from 'react';
import { Clock, HardDrive } from 'lucide-react';

const FileList = ({ ws, isConnected }) => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [transferStatus, setTransferStatus] = useState('');

  useEffect(() => {
    if (!ws || !isConnected) return;

    console.log('Requesting file list');
    ws.send(JSON.stringify({ type: 'GET_FILE_LIST' }));

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
    <>
      <h2 className="text-lg font-semibold mb-4">Available Recordings</h2>
      <div className="recordings-list">
        {files.length === 0 ? (
          <p className="text-gray-500">No recordings found</p>
        ) : (
          files.map((file, index) => (
            <div key={index} className="recording-item">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{file.name}</p>
                  <div className="flex items-center mt-1 space-x-4">
                    <div className="flex items-center">
                      <HardDrive size={16} className="mr-1" />
                      <span>Slot {file.slot}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock size={16} className="mr-1" />
                      <span>{file.duration || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export default FileList;
