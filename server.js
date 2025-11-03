console.log('Starting server...');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const errorHandler = require('./src/middleware/errorHandler');
const { PORT } = require('./src/config/constants');

const app = express();
console.log('Express app created');
const server = http.createServer(app);
console.log('HTTP server created');
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});
console.log('Socket.io initialized');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/widget/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
  res.json({ status: 'Server is running', timestamp: Date.now() });
});

const stateManager = require('./src/services/StateManager');
console.log('StateManager initialized');

// Socket.io manager
require('./src/services/SocketManager').initialize(io);
console.log('SocketManager initialized');

stateManager.dataFetcherService.initialize();

// Global error handler
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await stateManager.dataFetcherService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await stateManager.dataFetcherService.cleanup();
    process.exit(0);
});
