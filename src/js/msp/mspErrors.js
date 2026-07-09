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
