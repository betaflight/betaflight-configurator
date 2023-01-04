/**
 * Gets one or more items from sessionStorage
 * @param {string | string[]} key string or array of strings
 * @returns {object}
 */
export function get(key) {
  let result = {};
  if (Array.isArray(key)) {
    key.forEach(function (element) {
      try {
        result = { ...result, ...JSON.parse(sessionStorage.getItem(element)) };
      } catch (e) {
        console.error(e);
      }
    });
  } else {
    const keyValue = sessionStorage.getItem(key);
    if (keyValue) {
      try {
        result = JSON.parse(keyValue);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return result;
}

/**
 * Save dictionary of key/value pairs to sessionStorage
 * @param {object} input object which keys are strings and values are serializable objects
 */
export function set(input) {
  Object.keys(input).forEach(function (element) {
    const tmpObj = {};
    tmpObj[element] = input[element];
    try {
      sessionStorage.setItem(element, JSON.stringify(tmpObj));
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Remove item from sessionStorage
 * @param {string} item key to remove from storage
 */
export function remove(item) {
  sessionStorage.removeItem(item);
}

/**
 * Clear sessionStorage
 */
export function clear() {
  sessionStorage.clear();
}
