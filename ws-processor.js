


var util = require('util'),
    events = require('events'),
    crypto = require('crypto'),
    emitter = new events.EventEmitter()
;


var WsProcessor = function(connection) {
	this.connection = connection;
	this.wsProcessor = null;  // dont know which protocol yet
	this.HsProcessor = new HsProcessor();
	//this.decoder = new StringDecoder('utf8');
};
WsProcessor.prototype.log = function(type, detail) {
    console.log('[WsProcessor] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
WsProcessor.prototype.process = function() {
	var conn = this.connection;
	var buffer = conn.buffer, offset = conn.offset, total = conn.totalBytes;

	if(this.wsProcessor) {
		return this.wsProcessor.process(buffer, offset, total);
	}

	var res = this.HsProcessor.process(buffer, offset, total);
	if(res) {
		this.log('process', 'Sending HS reply:\n' + res.hs);
		this.connection.write(res.hs);
		
		if(res.mode === 'hybi')
			this.wsProcessor = new HybiWsProcessor(this.connection);
		else if(res.mode === 'hixie')
			this.wsProcessor = new HixieWsProcessor(this.connection);

		if(this.wsProcessor)
			var my = this;
			emitter.on('Error', function(err) {
				my.log('error', err);
			});

		return total;
	}

	return 0;
};



var HsProcessor = function() {

};
HsProcessor.prototype.process = function(buffer, offset, total) {
	var res = null;
	this.hs = buffer.toString('utf8', offset, total);
	if(this.completeHsReceived(buffer, offset, total)) {
		this.log('process:', 'Incoming HS:\n' + this.hs);
		res = {};
		var mode = res.mode = this.getHsMode();
		this.log('process', mode);
		if(mode === 'hybi') {
			this.processHybi(res);
		}
		else if(mode === 'hixie') {
			this.processHixie(res);
		}
	}
	return res;
};
HsProcessor.prototype.log = function(type, detail) {
    console.log('[HsProcessor] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
HsProcessor.prototype.completeHsReceived = function(buffer, offset, total) {
	return buffer[total-1] == 10 && buffer[total-2] == 13;
};
HsProcessor.prototype.getHsMode = function() {
	if(this.hs.match(/Sec-WebSocket-Version:/)) return 'hybi';
	return 'hixie'
};
HsProcessor.prototype.processHybi = function(res) {
	var key = this.hs.match(/Sec-WebSocket-Key:\s*(.+)/)[1];
	key += '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
	var acceptkey = crypto.createHash('sha1').update(key).digest('base64');
	res.hs = '' +
	'HTTP/1.1 101 Switching Protocols\r\n' + 
    'Upgrade: websocket\r\n' + 
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptkey + '\r\n\r\n';
};
HsProcessor.prototype.processHixie = function(res) {
	// todo
};


/*
      0                   1                   2                   3
      0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
     +-+-+-+-+-------+-+-------------+-------------------------------+
     |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
     |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
     |N|V|V|V|       |S|             |   (if payload len==126/127)   |
     | |1|2|3|       |K|             |                               |
     +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
     |     Extended payload length continued, if payload len == 127  |
     + - - - - - - - - - - - - - - - +-------------------------------+
     |                               |Masking-key, if MASK set to 1  |
     +-------------------------------+-------------------------------+
     | Masking-key (continued)       |          Payload Data         |
     +-------------------------------- - - - - - - - - - - - - - - - +
     :                     Payload Data continued ...                :
     + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
     |                     Payload Data continued ...                |
     +---------------------------------------------------------------+
*/



var HybiWsProcessor = function(conn) {
	this.connection = conn;
};
HybiWsProcessor.prototype.log = function(type, detail) {
    console.log('[HybiWsProcessor] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
HybiWsProcessor.prototype.process = function(buffer, offset, total) {
	this.log('process', (total - offset) + ' bytes');

	var b1 = buffer[offset],
		maskOpCode = 15;

	var opcode = maskOpCode & b1;
	//this.log('opcode', opcode);

	switch(opcode) {
		case 0:
		case 1:
			return this.processTextFrame(buffer, offset, total);
		case 2:
		case 3:
		case 4:
		case 5:
		case 6:
		case 7:
		case 8:
			return this.processCloseFrame(buffer, offset, total);
		case 9:
			return this.processPingFrame(buffer, offset, total);
		case 10:
			return this.processPongFrame(buffer, offset, total);

	}

};
HybiWsProcessor.prototype.closeAndEmitError = function(message) {
	emitter.emit('Error', message);
	this.connection.close(new Buffer([8,0]));  // 00001000 [close-opcode], 00000000 [0 payload]
};
HybiWsProcessor.prototype.processTextFrame = function(buffer, offset, total) {
	var b2 = buffer[offset+1],
		maskMask = 128;

	//this.log('processTextFrame', 'b2=' + b2);
	console.log(buffer);

	// RULE - client frames must be masked:
	if(b2 < maskMask) {
		this.closeAndEmitError('Client frame not masked');  
		return 0;
	}

	var payloadLength = 127 & b2,
		maskStartByteIdx = 2;

	if(payloadLength == 126) {
		payloadLength = buffer.readUInt16BE(2);  // bytes 3+4 == UINT length
		maskStartByteIdx += 2;
	}
	else if(payloadLength == 127) {
		this.closeAndEmitError('payload too big');  
		return 0;
	}

	if(total < payloadLength) {
		return 0;  // incomplete payload.  Need to read another chunk.
	}

	this.log('processTextFrame', 'payloadLength=' + payloadLength);

	var payloadStartIdx = maskStartByteIdx + 4;


	var conv = new Buffer(payloadLength), payloadIdx, mod, mask;
	for(var i = 0; i < payloadLength; i++) {
		payloadIdx = i + offset + payloadStartIdx;
		mod = i % 4;
		mask = buffer[offset + maskStartByteIdx + mod];
		conv[i] = buffer[payloadIdx] ^ mask;
		//console.log(i + ') ' + conv[i] + '<--' + buffer[payloadIdx] + ' XOR ' + mask);
	}
	
	console.log('converted=\n' + conv.toString('utf8'));

	return payloadLength + payloadStartIdx
	



};
HybiWsProcessor.prototype.processPingFrame = function(buffer, offset, total) {

};
HybiWsProcessor.prototype.processPongFrame = function(buffer, offset, total) {

};
HybiWsProcessor.prototype.processCloseFrame = function(buffer, offset, total) {

};




// todo
var HixieWsProcessor = function(conn) {
	this.connection = conn;
};



 module.exports = WsProcessor;


 /*

Hixie
		HTTP/1.1 101 WebSocket Protocol Handshake
        Upgrade: WebSocket
        Connection: Upgrade
        Sec-WebSocket-Origin: http://example.com
        Sec-WebSocket-Location: ws://example.com/demo
        Sec-WebSocket-Protocol: sample

        8jKS'y:G*Co,Wxa-

Hybi
		GET /chat HTTP/1.1
        Host: server.example.com
        Upgrade: websocket
        Connection: Upgrade
        Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
        Origin: http://example.com
        Sec-WebSocket-Protocol: chat, superchat
        Sec-WebSocket-Version: 13

	


 */