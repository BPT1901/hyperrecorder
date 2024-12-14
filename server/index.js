// server/index.js
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');
const net = require('net');
const FileWatcher = require('./services/fileWatcher');
const hyperdeckService = require('./services/hyperdeckService');

// Express app setup
const app = express();
const PORT = 3001;

// Track connected HyperDecks and their IPs
const connectedDevices = new Map();
const activeWatchers = new Map();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Server setup
const server = http.createServer(app);

// WebSocket setup
const wss = new WebSocket.Server({ 
  server,
  path: '/ws'
});

// WebSocket error handling
wss.on('error', (error) => {
  console.error('WebSocket Server Error:', error);
});

wss.on('connection', (ws, req) => {
  console.log('New client connected from:', req.socket.remoteAddress);
  
  // Setup connection health check
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('error', (error) => {
    console.error('WebSocket Client Error:', error);
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);

      switch (data.type) {
          case 'CONNECT_HYPERDECK':
          try {
            await hyperdeckService.connect(data.ipAddress);
            // After connecting, scan both slots
            await hyperdeckService.sendCommand('slot select: 1');
            let clips1 = await hyperdeckService.getClipList();
            await hyperdeckService.sendCommand('slot select: 2');
            let clips2 = await hyperdeckService.getClipList();
            
            // Combine clips from both slots
            const allClips = [
              ...clips1.map(clip => ({ ...clip, slot: 1 })),
              ...clips2.map(clip => ({ ...clip, slot: 2 }))
            ];
            
            ws.send(JSON.stringify({
              type: 'CLIP_LIST',
              clips: allClips
            }));
            
            ws.send(JSON.stringify({ 
              type: 'CONNECTED',
              message: 'Successfully connected to HyperDeck'
            }));
          } catch (error) {
            console.error('Error connecting to HyperDeck:', error);
            ws.send(JSON.stringify({ 
              type: 'ERROR', 
              message: 'Failed to connect to HyperDeck: ' + error.message 
            }));
          }
          break;

          case 'GET_FILE_LIST':
        try {
          // Scan both slots again for updated list
          await hyperdeckService.sendCommand('slot select: 1');
          let clips1 = await hyperdeckService.getClipList();
          await hyperdeckService.sendCommand('slot select: 2');
          let clips2 = await hyperdeckService.getClipList();
          
          const allClips = [
            ...clips1.map(clip => ({ ...clip, slot: 1 })),
            ...clips2.map(clip => ({ ...clip, slot: 2 }))
          ];
          
          ws.send(JSON.stringify({
            type: 'CLIP_LIST',
            clips: allClips
          }));
        } catch (error) {
          console.error('Error getting clip list:', error);
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Failed to get clip list'
          }));
        }
        break;

        case 'START_MONITORING':
          try {
            const hyperdeckIp = connectedDevices.get(ws);
            if (!hyperdeckIp) {
              throw new Error('Please connect to HyperDeck first');
            }

            const fileWatcher = new FileWatcher({
              drives: data.drives,
              destinationPath: data.destinationPath,
              hyperdeckIp: hyperdeckIp
            });

            fileWatcher.on('newFile', async (filePath) => {
              try {
                console.log(`New file detected: ${filePath}`);
                ws.send(JSON.stringify({
                  type: 'FILE_DETECTED',
                  filePath
                }));

                await fileWatcher.transferFile(filePath);
                
                ws.send(JSON.stringify({
                  type: 'TRANSFER_COMPLETE',
                  filePath,
                  destinationPath: data.destinationPath
                }));
              } catch (error) {
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: `Transfer failed: ${error.message}`
                }));
              }
            });

            activeWatchers.set(ws, fileWatcher);
            fileWatcher.startMonitoring();
            
            ws.send(JSON.stringify({
              type: 'MONITORING_STARTED',
              message: 'Started monitoring HyperDeck for new files'
            }));
          } catch (error) {
            console.error('Error starting monitoring:', error);
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: error.message
            }));
          }
          break;

          case 'STOP_MONITORING':
            try {
              const fileWatcher = activeWatchers.get(ws);
              if (fileWatcher) {
                ws.send(JSON.stringify({
                  type: 'TRANSFER_STATUS',
                  message: 'Initiating final transfer check...'
                }));
                
                try {
                  await fileWatcher.stop();
                  
                  ws.send(JSON.stringify({
                    type: 'MONITORING_STOPPED',
                    message: 'Monitoring stopped and final files transferred'
                  }));
                } catch (error) {
                  ws.send(JSON.stringify({
                    type: 'ERROR',
                    message: `Final transfer failed: ${error.message}`
                  }));
                }
                
                activeWatchers.delete(ws);
              }
            } catch (error) {
              console.error('Error stopping monitoring:', error);
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: `Failed to stop monitoring: ${error.message}`
              }));
            }
            break;

        default:
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    connectedDevices.delete(ws);
    const fileWatcher = activeWatchers.get(ws);
    if (fileWatcher) {
      fileWatcher.stop();
      activeWatchers.delete(ws);
    }
  });
});

// Implement connection health check
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  
  wss.clients.forEach((ws) => {
    const fileWatcher = activeWatchers.get(ws);
    if (fileWatcher) {
      fileWatcher.stop();
      activeWatchers.delete(ws);
    }
    connectedDevices.delete(ws);
  });

  clearInterval(interval);
  
  wss.close(() => {
    server.close(() => {
      console.log('Server shutdown complete');
      process.exit(0);
    });
  });
});

module.exports = server;