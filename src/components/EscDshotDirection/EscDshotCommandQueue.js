'use strict';

class EscDshotCommandQueue
{
    constructor (intervalMs)
    {
        this._intervalId = null;
        this._interval = intervalMs;
        this._queue = [];
        this._purging = false;
    }

    pushCommand(command, buffer)
    {
        this._queue.push([command, buffer]);
    }

    pushPause(milliseconds)
    {
        const counter = Math.ceil(milliseconds / this._interval);

        for (let i = 0; i < counter; i++) {
            this.pushCommand(null, null);
        }
    }

    start()
    {
        if (null === this._intervalId) {
            this._intervalId = setInterval(
                () => { this._checkQueue(); },
                this._interval);
        }
    }

    stop()
    {
        if(null !== this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    stopWhenEmpty()
    {
        this._purging = true;
    }

    clear()
    {
        this._queue = [];
    }

    _checkQueue()
    {
        if (0 !== this._queue.length) {
            const command = this._queue.shift();

            if (null !== command[0]) {
                MSP.send_message(command[0], command[1]);
            }
        } else if (this._purging) {
            this._purging = false;
            this.stop();
        }
    }
}
