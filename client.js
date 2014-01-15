var net = require('net');

var HOST = '127.0.0.1';
var PORT = 8080;

var client = new net.Socket();
client.connect(PORT, HOST, function() {

    console.log('CONNECTED TO: ' + HOST + ':' + PORT);
    
    var request = {
    	cmd: 'register',
    	prefix: 'si',
    	schema: {
    		dref: '$[string(=id)]*',
            title: '$[string(Spot, {3:U}/{3:U})]',  
            b: '[double(5:3>1:1)]',
            a: '[double(=b+3)]',
            chg: '[double(^b)]',
            chk: '[int(1-100)]'
    	}
    };
    client.write(JSON.stringify(request));

    for(var i = 0; i < 10; i++) {
        request = {
            cmd: 'subscribe',
            id: 'si10' + i
        };
        client.write(JSON.stringify(request));
    }

});

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', function(data) {
    
    console.log('DATA: ' + data);
    // Close the client socket completely
    //client.destroy();
    
});

// Add a 'close' event handler for the client socket
client.on('close', function() {
    console.log('Connection closed');
});