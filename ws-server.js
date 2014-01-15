

var net = require('net'),
    util = require('util'),
    events = require('events').EventEmitter,
    wsProcessor = require('./ws-processor'),
    connectionId = 1;


var WsServer = function() {
    this.server = net.createServer(this.handleNewConnection.bind(this));
    this.connections = [];
};
util.inherits(WsServer, events);
WsServer.prototype.handleNewConnection = function(socket) {
    var conn = new Connection(socket);
    this.connections.push(conn);
    conn.on('error', this.onConnectionError.bind(this));
    conn.on('close', this.onConnectionClose.bind(this));
    conn.on('start', this.onConnectionStart.bind(this));
};
WsServer.prototype.start = function(port, host) {
  this.port = port;
  this.server.listen(port);
  util.puts('WS Server running at ' + host + ':' + port);
};
WsServer.prototype.onConnectionStart = function(conn) {
    this.emit('connection', conn);
};
WsServer.prototype.onConnectionError = function(err) {
    this.emit('error', err.message);
};
WsServer.prototype.onConnectionClose = function(connectionId) {
    this.emit('close', connectionId);
    this.tidyConnection(connectionId);
};
WsServer.prototype.tidyConnection = function(connectionId) {
    for(var i = 0; i < this.connections.length; i++) {
        var conn = this.connections[i];
        if(conn.connectionId == connectionId) {
            this.unwireConnection(conn);

            if(this.connections.length == 1) this.connections = [];
            else {
                this.connections.splice(i,1);
            }

            break;
        }
    }

};
WsServer.prototype.unwireConnection = function(conn) {
    conn.removeAllListeners();
};


var Connection = function(socket){
    this.connectionId = connectionId++;
    this.socket = socket;
    this.remote = {
        host: socket.remoteAddress,
        port: socket.remotePort
    };
    this.connected = true;
    this.wsproc = new wsProcessor(this, this.handleWsProcData.bind(this));
    this.wsproc.on('start', this.handleWsProcStart.bind(this));
    this.wsproc.on('error', this.handleWsProcError.bind(this));

    this.offset = 0;
    this.totalBytes = 0;
    this.buffer = new Buffer(1024);
    this.log('ctor', util.inspect(this.remote));
    socket.on('data', this.handleSocketData.bind(this));
    socket.on('close', this.handleSocketClose.bind(this));
    socket.on('error', this.handleSocketError.bind(this));
};
util.inherits(Connection, events);
Connection.prototype.__write = function(data) {
    this.socket.write(data);
};
Connection.prototype.send = function(data) {
    if(typeof data === 'object') data = JSON.stringify(data);
    if(typeof data === 'string') data = new Buffer(data, 'utf8');
    //this.log('send', data);
    this.wsproc.send(data);
};
Connection.prototype.close = function() {
    this.log('close');
    this.socket.end();
    this.connected = false;
    this.emit('close', this.connectionId);
};
Connection.prototype.log = function(type, detail) {
    console.log('[Connection ' + this.connectionId + '] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
Connection.prototype.handleWsProcData = function(data) {
    this.emit('data', data);
};
Connection.prototype.handleWsProcStart = function() {
    this.log('handleWsProcStart', 'WS connection started');
    this.emit('start', this);
};
Connection.prototype.handleWsProcError = function(msg) {
    this.log('handleWsProcError', msg);
    this.close();
    this.emit('error', {connectionId: this.connectionId, message: msg});
};
Connection.prototype.handleSocketData = function(data) {
    if(!this.connected) {
        this.log('handleSocketData', 'Exiting - connection was disconnected');
    }
    var bytesRead = data.length, bytesProcessed = 0;
    data.copy(this.buffer, this.offset, 0, data.length);
    this.totalBytes += bytesRead;
    this.log('handleSocketData', 'bytesRead=' + bytesRead + ', offset=' + this.offset + ', totalBytes=' + this.totalBytes);
    var remaining = this.totalBytes - this.offset;
    while(remaining > 0 && (bytesProcessed = this.wsproc.process())) {
        this.offset += bytesProcessed;
        remaining = this.totalBytes - this.offset;
        if(remaining > 0)
            this.log('handleSocketData', 'processed=' + bytesProcessed + ', remaining=' + remaining);
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
    this.close();
};
Connection.prototype.handleWsData = function(data) {
    this.log('wsdata', data);
};

module.exports = WsServer;





