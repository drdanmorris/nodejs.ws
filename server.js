var HOST = '127.0.0.1';
var PORT = 8080;


var net = require('net'),
    util = require('util'),
    events = require('events'),
    Cache = require('./cache')
    ;


function main(argv) {
    startServer(argv);
    //test();
}

function test() {
    var cache = new Cache({connectionId:1});
    var schema = {
        dref: '$[=id]*',
        title: '$[string(Spot, {3:U}/{3:U})]',  
        b: '[double(5:3>1:1)]',
        a: '[=b+3]',
        chg: '[chg(b)]',
        chk: '[int(1-100)]'
    };

    var options = {
        incremental: true
    };

    cache.register('si', schema, options);
    cache.subscribe('si100', {overrides: {title:'EUR/USD'}});
    cache.subscribe('si101');
}

function startServer(argv){
    new DataServer().start(
        argv[2] || PORT, 
        argv[3] || HOST);
}

var connectionId = 1;

var Connection = function(socket){
    this.connectionId = connectionId++;
    this.socket = socket;
    this.cache = new Cache(this);
    this.remote = {
        host: socket.remoteAddress,
        port: socket.remotePort
    };

    this.received = null;
    
    this.log('connection', util.inspect(this.remote));
    socket.on('data', this.handleSocketData.bind(this));
    socket.on('close', this.handleSocketClose.bind(this));
    socket.on('error', this.handleSocketError.bind(this));
};
Connection.prototype.write = function(msg) {
    this.socket.write(msg);
};
Connection.prototype.log = function(type, detail) {
    //if(typeof detail === 'object') detail = util.inspect(detail);
    console.log('(' + this.connectionId + ') ' + type.toUpperCase() + ' - ' + (detail || '') );
};
Connection.prototype.handleSocketData = function(data) {
    this.log('data', data);

    // cater for chunking and concatenated messages
    // {cmd: ... }{cmd: ... }

    if(!this.received) this.received = '';
    this.received += data;  

    var msg;
    while(msg = this.processReceivedData()) {
        if(msg) {
            console.log('\n\nprocessing msg: ' + msg);
            var request = JSON.parse(msg);
            switch(request.cmd) {
                case 'register':
                    var prefix = request.prefix,
                        schema = request.schema;
                    this.cache.register(prefix, schema);
                    break;
                 case 'subscribe':
                    this.cache.subscribe(request.id, request.options);
                    break;
            }
        }
    }
};
Connection.prototype.processReceivedData = function() {
    var curlyCount = 0, from = -1;
    for(var i = 0; i < this.received.length; i++) {
        if(curlyCount == 0 && this.received[i] !== '{') continue;
        if(from < 0) from == i;  // reset from to beginning of msg
        if(this.received[i] === '{') curlyCount += 1;
        else if(this.received[i] === '}') curlyCount -= 1;
        if(i > 0 && curlyCount == 0) {
            // we have a complete msg
            var msg = this.received.substring(from, i + 1);
            this.received = this.received.substring(i + 1);
            //console.log('msg=' + msg);
            //console.log('remaining=' + this.received);
            return msg;
        }
    }
    return null;
};
Connection.prototype.handleSocketClose = function() {
    this.log('closed');
    this.cache.stop();
};
Connection.prototype.handleSocketError = function(data) {
    this.log('error', data);
};


var DataServer = function() {
    this.server = net.createServer(this.handleNewConnection.bind(this));
    this.connections = [];
};
DataServer.prototype.handleNewConnection = function(socket) {
    var conn = new Connection(socket);
    this.connections.push(conn);
};
DataServer.prototype.start = function(port, host) {
  this.port = port;
  this.server.listen(port);
  util.puts('Socket Server running at ' + host + ':' + port);
};


main(process.argv);

