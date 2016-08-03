function FC() {
	this._subConfigCategories = [];
	
	this.setConfigProvider = function(configProvider) {
		this._subConfigCategories.forEach(function (subConfig) {
			subConfig.setConfigProvider(configProvider);
		});	
	}
	this.add = function(config) {
		this._subConfigCategories.push(config);
	}
}

function Config(properties) {
	this.properties = properties;
	this.propertyRefreshed = {};
	this._configProvider;
	this._listeners = [];
	
	Object.keys(properties).forEach(function (prop) {	
		Object.defineProperty(this, prop, {
			get: function () {
				if (this.propertyRefreshed[prop] || prop === 'configName')
					return properties[prop];
				else {
					try {
						this.requestUpdate(prop);
						return properties[prop];
					} catch (e) {
						return null;
					}
				}
			},
			set: function (val) {
				properties[prop] = val;
				this.propertyRefreshed[prop] = true;
			}
		})
	}, this);
	
	this.setConfigProvider = function(configProvider) {
		this._configProvider = configProvider;
	}
	
	this.requestUpdate = function(prop) {
		this._configProvider.update(this);
	}
	this.refresh = function() {
		this.propertyRefreshed = {};
	}
	this.populate = function() {
	    this.refresh();
	    this._configProvider.populate(this);
	}
	this.listen = function(listener) {
	    this._listeners.push(listener);
	}
	this.update = function() {
	    this._listeners.forEach(function (listener) {
	       listener();
	    });
	}
	this.save = function() {
	    this._configProvider.save(this);
	}
}



