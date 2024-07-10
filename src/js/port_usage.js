import { serialShim } from "./serial_shim";

const serial = serialShim();

const PortUsage = {
    previous_received:  0,
    previous_sent:      0,
    port_usage_down:    0,
    port_usage_up:      0,

    initialize: function() {
        const self = this;

        self.main_timer_reference = setInterval(function() {
            self.update();
        }, 1000);
    },
    update: function() {
        if (serial.bitrate) {
            const port_usage_down = parseInt(((serial.bytesReceived - this.previous_received) * 10 / serial.bitrate) * 100);
            const port_usage_up = parseInt(((serial.bytesSent - this.previous_sent) * 10 / serial.bitrate) * 100);

            this.previous_received = serial.bytesReceived;
            this.previous_sent = serial.bytesSent;
            this.port_usage_down = port_usage_down;
            this.port_usage_up = port_usage_up;

        } else {
            this.port_usage_down = 0;
            this.port_usage_up = 0;
        }
    },
    reset: function() {
        this.previous_received = 0;
        this.previous_sent = 0;

        this.port_usage_down = 0;
        this.port_usage_up = 0;
    },
};

// drop these after all is in modules
window.PortUsage = PortUsage;
export default PortUsage;
