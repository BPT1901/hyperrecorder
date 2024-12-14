// server/services/hyperdeckService.js
const net = require('net');
const EventEmitter = require('events');

class HyperdeckService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.ipAddress = null;
    this.monitoring = false;
    this.monitoringInterval = null;
    this.buffer = '';
  }

  connect(ipAddress) {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        this.disconnect();
      }
  
      this.ipAddress = ipAddress;
      this.client = new net.Socket();
  
      this.client.connect(9993, ipAddress, () => {
        console.log('Connected to Hyperdeck at:', ipAddress);
        this.connected = true;
        resolve(true);
      });
  
      this.client.on('error', (error) => {
        console.error('Hyperdeck connection error:', error);
        this.connected = false;
        reject(error);
      });
  
      this.client.on('close', () => {
        console.log('Hyperdeck connection closed');
        this.connected = false;
      });
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop(); // Keep incomplete line

    lines.forEach(line => {
      if (line) {
        this.emit('response', line);
        this.parseResponse(line);
      }
    });
  }

  parseResponse(response) {
    // Parse slot info
    if (response.includes('slot id:')) {
      const slotMatch = response.match(/slot id: (\d+)/);
      const statusMatch = response.match(/status: (\w+)/);
      const recordingMatch = response.match(/recording time: (\d+:\d+:\d+:\d+)/);
      
      if (slotMatch && statusMatch) {
        this.emit('slotStatus', {
          slot: slotMatch[1],
          status: statusMatch[1],
          recordingTime: recordingMatch ? recordingMatch[1] : null
        });
      }
    }
  }

  async sendCommand(command) {
    if (!this.connected) {
      throw new Error('Not connected to Hyperdeck');
    }

    return new Promise((resolve, reject) => {
      this.client.write(command + '\r\n', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  startMonitoring(drives) {
    if (!this.connected) {
      throw new Error('Not connected to Hyperdeck');
    }

    this.monitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        if (drives.ssd1) {
          await this.sendCommand('slot info: 1');
        }
        if (drives.ssd2) {
          await this.sendCommand('slot info: 2');
        }
        await this.sendCommand('transport info');
      } catch (error) {
        console.error('Error during monitoring:', error);
        this.emit('error', error);
      }
    }, 1000);
  }

  stopMonitoring() {
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  disconnect() {
    this.stopMonitoring();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.connected = false;
  }
}

module.exports = new HyperdeckService();