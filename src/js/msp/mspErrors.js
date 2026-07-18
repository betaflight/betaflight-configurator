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
