// Small test-friendly logger wrapper. Tests can mock/spy on these methods
// if they want to suppress or capture output.
const logger = {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
};

export default logger;
