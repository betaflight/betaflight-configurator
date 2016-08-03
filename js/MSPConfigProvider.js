function MSPConfigProvider() {
	var MSPCommands = {};
	
	MSPCommands.BLACKBOX = ({
        populate:           MSP_codes.MSP_BLACKBOX_CONFIG,
        save:               MSP_codes.MSP_SET_BLACKBOX_CONFIG
	});
	
	MSPCommands.DATAFLASH = ({
        populate:           MSP_codes.MSP_DATAFLASH_SUMMARY
	});
	
	MSPCommands.PID_ADVANCED_CONFIG  = ({
        populate:           MSP_codes.MSP_ADVANCED_CONFIG,
        save:               MSP_codes.MSP_SET_ADVANCED_CONFIG
	});
	
	this.update = function(config) {
	    if (typeof MSPCommands[config.configName].populate === "object") {
	        MSPCommands[config.configName].populate.forEach(function (mspCode) {
	            MSP.send_message(mspCode, false, false, false);
	        });
	    } else {
	        MSP.send_message(MSPCommands[config.configName].populate, false, false, false);
	    }
	}
	this.populate = function(config) {
	    this.update(config);
	}
	this.save = function(config) {
	    try {
	        MSP.send_message(MSPCommands[config.configName].save, MSP.crunch(MSPCommands[config.configName].save), false, false, false);
	    } catch (e) {
	        console.log(config.configName +" NOT saved.")
	    }
	}
}