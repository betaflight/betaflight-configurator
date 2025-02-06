/**
 * Removes a specified element from an array if it exists.
 *
 * @param {Array} elements - The array from which to remove the element.
 * @param {*} element - The element to be removed from the array.
 */
export function removeArrayElement(elements, element) {
    const index = elements.indexOf(element);
    if (index !== -1) {
        elements.splice(index, 1);
    }
}

/**
 * Adds an element to the array after a specified element if it does not already exist in the array.
 *
 * @param {Array} elements - The array to which the element will be added.
 * @param {*} element - The element to add to the array.
 * @param {*} afterElement - The element after which the new element will be added.
 */
export function addArrayElementAfter(elements, element, afterElement) {
    const elementIndex = elements.indexOf(element);
    if (elementIndex === -1) {
        elements.splice(elements.indexOf(afterElement) + 1, 0, element);
    }
}

/**
 * Adds an element to an array if it is not already present.
 *
 * @param {Array} elements - The array to which the element should be added.
 * @param {*} element - The element to add to the array.
 */
export function addArrayElement(elements, element) {
    if (!elements.includes(element)) {
        elements.push(element);
    }
}

/**
 * Replaces an element in an array with a new element.
 *
 * @param {Array} elements - The array containing the element to be replaced.
 * @param {*} element - The element to be replaced.
 * @param {*} replacement - The new element to replace the old element.
 */
export function replaceArrayElement(elements, element, replacement) {
    const index = elements.indexOf(element);
    if (index !== -1) {
        elements[index] = replacement;
    }
}
