
var wsServer = require('./ws-server'),
	Cache = require('./cache'),
	util = require('util'),
    HOST = '127.0.0.1',
    PORT = 8081;

var argv = process.argv,
	session,
	sessionid = 1,
	server = new wsServer();


server.on('connection', function(connection) {
	session = new Session(connection);
});
server.start(argv[2] || PORT, argv[3] || HOST);


var ViewReference = function (raw) {
    var parts = raw.split('/');
    this.raw = raw;
    this.type = parts[0];
    this.subtype = parts[1];
    this.id = parts[2];
};
ViewReference.prototype.toString = function () {
    return this.raw;
};




var Session = function(connection) {
	this.sessionid = sessionid++;
	this.cache = new Cache(connection);
	this.connection = connection;
	connection.on('data', this.onData.bind(this));
	this.configureRequestProcessors();
};
Session.prototype.configureRequestProcessors = function() {
	this.requestProcessor = {
		subscribe: function(request) {
			var vref = new ViewReference(request.vref);
			return viewFactory.getView(vref);
		}
	};
};
Session.prototype.onData = function(buffer){
	var json = buffer.toString('utf8'),
		request = JSON.parse(json);

	this.log('Request', util.inspect(request));
	var view = this.requestProcessor[request.cmd](request);
	view.vref = request.vref;
	var res = {
		view: view,
		isInitial: true,
		responseId: request.requestId
	};
	//this.log('Response', util.inspect(res));
	this.connection.send(res);
};
Session.prototype.log = function(type, detail) {
    console.log('[Session ' + this.sessionid + '] ' + type.toUpperCase() + ' - ' + (detail || '') );
};
Session.prototype.end = function(data){
};



var viewFactory = {

	getView: function(vref) {
		return this[vref.type](vref);
	},

	menu: function(vref) {
		return {
			title : 'Watchlists',
			items: [
				{ title : "Popular Markets", navigateVref : "menupr/usr/wi100" },
				{ title : "Top Risers", navigateVref : "menupr/usr/wi101" },
				{ title : "Top Fallers", navigateVref : "menupr/usr/wi102" }
			]
		};
	},

	menupr: function(vref) {
		if (vref.id == "wi100")
        {
        	return {
				title : 'Popular Markets',
				items: [
					{title: "Spot, EUR/GBP", navigateVref: "price/trade/si1000", bid:1.01, ask:1.03, dref:"si1000"},
		            {title: "Spot, USD/EUR", navigateVref: "price/trade/si1001", bid:2.01, ask:2.03, dref:"si1001"},
		            {title: "Spot, NZD/AUD", navigateVref: "price/trade/si1002", bid:3.01, ask:3.03, dref:"si1002"}
				]
			};
		}
        else if (vref.id == "wi101")
        {
        	return {
				title : 'Top Risers',
				items: [
					{title: "Spot, SWF/GBP", navigateVref: "price/trade/si1100", bid:1.01, ask:1.03, dref:"si1100"},
		            {title: "Spot, USD/SWK", navigateVref: "price/trade/si1101", bid:2.01, ask:2.03, dref:"si1101"},
		            {title: "Spot, RUS/AUD", navigateVref: "price/trade/si1102", bid:3.01, ask:3.03, dref:"si1102"}
				]
			};
		}
        else
        {
        	return {
				title : 'Top Fallers',
				items: [
					{title: "Spot, KTG/SWE", navigateVref: "price/trade/si1200", bid:1.01, ask:1.03, dref:"si1200"},
		            {title: "Spot, USD/YEN", navigateVref: "price/trade/si1201", bid:2.01, ask:2.03, dref:"si1201"},
		            {title: "Spot, AUD/HKD", navigateVref: "price/trade/si1202", bid:3.01, ask:3.03, dref:"si1202"}
				]
			};
		}	
	}

};



