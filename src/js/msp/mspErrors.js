export class MspError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "MspError";
        this.code = code;
    }
}

export class MspTimeoutError extends MspError {
    constructor(message, code) {
        super(message, code);
        this.name = "MspTimeoutError";
    }
}

export class MspCancelledError extends MspError {
    constructor(message, code, reason = "cleanup") {
        super(message, code);
        this.name = "MspCancelledError";
        this.reason = reason;
    }
}

export class MspCrcError extends MspError {
    constructor(message, code) {
        super(message, code);
        this.name = "MspCrcError";
    }
}

/**
 * True when an error is a benign MSP request cancellation — the queue was cleared on a tab
 * switch (reason "cleanup") or a disconnect/reboot (reason "disconnected"), not a real request
 * failure (timeout, CRC). Lifecycle code (the live-data poller, the shared save helper) uses
 * this to avoid logging or surfacing an expected cancellation as a failure.
 */
export function isMspCancelled(error) {
    return error instanceof MspCancelledError;
}

/**
 * True when an MSP reply says the FC refused the request. Firmware rejects a serial config it
 * cannot apply (betaflight#15131) with an MSP error reply, which arrives as `unsupported` on the
 * response rather than as a rejected promise - so a caller that does not check this goes on to
 * write EEPROM and reboot on top of an unchanged config, and reports success.
 *
 * A missing response is not a rejection: MSP resolves with nothing when disconnected or in
 * virtual mode.
 *
 * Lives here rather than in MSPHelper so a caller can check it without importing that module,
 * which reaches serial_backend and closes an import cycle.
 */
export function isMspRejected(response) {
    return Boolean(response?.unsupported || response?.crcError);
}
