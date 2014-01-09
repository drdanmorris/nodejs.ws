


var net = require('net'),
    util = require('util'),
    events = require('events'),
    wsProcessor = require('./ws-processor'),
    HOST = '127.0.0.1',
    PORT = 8081,
    connectionId = 1;

// emitter = new events.eventEmitter(),

function main(argv) {
    new WsServer().start(
        argv[2] || PORT, 
        argv[3] || HOST);
}


var WsServer = function() {
    this.server = net.createServer(this.handleNewConnection.bind(this));
    this.connections = [];
};
WsServer.prototype.handleNewConnection = function(socket) {
    var conn = new Connection(socket);
    this.connections.push(conn);
};
WsServer.prototype.start = function(port, host) {
  this.port = port;
  this.server.listen(port);
  util.puts('WS Server running at ' + host + ':' + port);
};


var Connection = function(socket){
    this.connectionId = connectionId++;
    this.socket = socket;
    this.remote = {
        host: socket.remoteAddress,
        port: socket.remotePort
    };
    this.connected = true;
    this.wsproc = new wsProcessor(this);
    this.offset = 0;
    this.totalBytes = 0;
    this.buffer = new Buffer(1024);
    this.log('ctor', util.inspect(this.remote));
    socket.on('data', this.handleSocketData.bind(this));
    socket.on('close', this.handleSocketClose.bind(this));
    socket.on('error', this.handleSocketError.bind(this));

    //this.wsproc.on('data', this.handleWsData.bind(this));
};
Connection.prototype.write = function(data) {
    this.socket.write(data);
};
Connection.prototype.close = function(data) {
    this.socket.end(data);
    this.connected = false;
};
Connection.prototype.log = function(type, detail) {
    console.log('[Connection ' + this.connectionId + '] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
Connection.prototype.handleSocketData = function(data) {
    if(!this.connected) {
        this.log('handleSocketData::exiting', 'Connection not connected');
    }
    var bytesRead = data.length, bytesProcessed = 0;
    data.copy(this.buffer, this.offset, 0, data.length);
    this.totalBytes += bytesRead;
    this.log('handleSocketData::start', 'bytesRead=' + bytesRead + ', offset=' + this.offset + ', totalBytes=' + this.totalBytes);
    var remaining = this.totalBytes - this.offset;
    while(remaining > 0 && (bytesProcessed = this.wsproc.process())) {
        this.offset += bytesProcessed;
        remaining = this.totalBytes - this.offset;
        this.log('handleSocketData::loop', 'processed=' + bytesProcessed + ', remaining=' + remaining);
    }
    
    if(this.offset > 0 && remaining > 0) {
        // move remaining bytes to beginning of buffer
        this.log('handleSocketData::tidy', 'move remaining bytes to start of buffer');
        this.buffer = this.buffer.slice(this.offset, remaining);
        this.offset = this.totalBytes = remaining;
    }
    else if(this.offset == this.totalBytes) {
        this.offset = this.totalBytes = 0;
    }
};
Connection.prototype.handleSocketClose = function() {
    this.log('closed');
};
Connection.prototype.handleSocketError = function(data) {
    this.log('error', data);
};
Connection.prototype.handleWsData = function(data) {
    this.log('wsdata', data);
};

main(process.argv);




