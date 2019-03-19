function MkSGateway (key) {
	self = this;
	
	this.WS 				= null;
	this.Key 				= key;
	this.RestAPIPort 		= 8081;
	this.WSServerPort		= 1982;
	this.RestAPIUrl 		= "http://" + MkSGlobal.MakeSenseDomain;
	this.WSServerUrl		= "ws://" + MkSGlobal.MakeSenseDomain;
	this.RestAPIFullUrl 	= this.RestAPIUrl.concat(":", this.RestAPIPort);
	this.WSServerFullURl	= this.WSServerUrl.concat(":", this.WSServerPort);
	this.WSState 			= "DISCONN";

	// Callback management
	this.Callbacks 			= {};
	this.PacketCounter		= 1;
	this.SentPackets 		= [];
	
	// Callbacks
	this.OnGatewayDataArrivedCallback 		= null;
	this.OnGatewayConnectedCallback			= null;
	
	// Monitoring
	this.CallbacksMonitor 	= 0;
	
	return this;
}

MkSGateway.prototype.WSWatchdog = function () {
	
}

MkSGateway.prototype.CallbacksMonitor = function () {
	console.log("(CallbacksMonitor)");
	if (0 == Object.keys(this.Callbacks).length) {
		console.log("(CallbacksMonitor) Callbacks list empty");
		clearInterval(this.CallbacksMonitor);
	} else {
		for (key in this.Callbacks) {
			if (this.Callbacks.hasOwnProperty(key)) {
				item = this.Callbacks[key];
				
				if (item.timeout_counter > 5) {
					// Call callback with error.
					item.callback(null, {error: "timeout"});
					delete item;
				} else {
					item.timeout_counter++;
				}
			}
		}
	}
}

MkSGateway.prototype.IsConnected = function () {
	return "CONN" == this.WSState;
}

MkSGateway.prototype.Connect = function (callback) {
	var self = this;
	
	if ("DISCONN" == this.WSState) {
		this.WS = new WebSocket(this.WSServerFullURl, ['echo-protocol']);
		this.WS.onopen = function () {
			var handshakeMsg = {
				header: {
					message_type: 'HANDSHAKE'
				},
				key: self.Key
			};
			console.log('Connected to Gateway ... Sending handshake ...', handshakeMsg);
			self.WS.send(JSON.stringify(handshakeMsg));
			self.WSState = "CONN";

			callback();
			
			if (null != self.OnGatewayConnectedCallback) {
				self.OnGatewayConnectedCallback();
			}
		};
		
		this.WS.onmessage = function (event) {
			var jsonData = JSON.parse(event.data);

			console.log("[#2] Identifier #", jsonData.piggybag.identifier, "recieved.", jsonData.data.header.command);
			
			if (self.Callbacks[jsonData.piggybag.identifier]) {
				handler = self.Callbacks[jsonData.piggybag.identifier];
				handler.callback(jsonData, {error: "none"});
				
				console.log("[#2] Delete Identifier #", jsonData.piggybag.identifier);
				delete self.Callbacks[jsonData.piggybag.identifier];

				if (null != self.OnGatewayConnectedCallback) {
					self.OnGatewayConnectedCallback(jsonData);
				}
			} else {
				console.log('[ERROR] Unexpected idetifier', jsonData.piggybag.identifier);
			}
		}
		
		this.WS.onerror = function (event) {
			console.log("[ERROR] Websocket", event.data);
		}
		
		this.WS.onclose = function () {
			console.log("Connection closed...");
			self.WSState = "DISCONN";
		};
	}
}

MkSGateway.prototype.Send = function (type, dest_uuid, cmd, payload, additional, callback) {
	var self = this;

	if ("" == additional) {
		additional = {};
	}
	
	if ("" == payload) {
		payload = {};
	}
	
	request = {
		header: {
			message_type: type,
			destination: dest_uuid,
			source: "WEBFACE"
		},
		data: {
			header: {
				command: cmd,
				timestamp: Date.now()
			},
			payload: payload
		},
		user: {
			key: this.Key
		},
		additional: additional,
		piggybag: {
			identifier: this.PacketCounter
		}
	}
	
	this.Callbacks[this.PacketCounter] = { 
											callback: callback,
											timeout_counter: 0
										 };
	console.log("[#2] Identifier #", this.PacketCounter, "sent.", cmd);

	this.PacketCounter++;
	if (this.PacketCounter < 1) {
		this.PacketCounter = 0;
	}

	this.WS.send(JSON.stringify(request));
	
	if (!this.CallbacksMonitor) {
		this.CallbacksMonitor = setInterval(this.CallbacksMonitor, 1000);
	}
}

MkSGateway.prototype.SetRestApi = function (url, port) {
	this.RestAPIUrl 	= url;
	this.RestAPIPort 	= port;
	this.RestAPIFullUrl = this.RestAPIUrl.concat(':', this.RestAPIPort);
}

var MkSGatewayBuilder = (function () {
	var Instance;

	function CreateInstance (key) {
		var obj = new MkSGateway(key);
		return obj;
	}

	return {
		GetInstance: function (key) {
			if (!Instance) {
				Instance = CreateInstance(key);
			}

			return Instance;
		}
	};
})();