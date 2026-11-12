/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Removes a specified element from an array if it exists.
 *
 * @param elements - The array from which to remove the element.
 * @param element - The element to be removed from the array.
 */
export function removeArrayElement<T>(elements: T[], element: T): void {
    const index = elements.indexOf(element);
    if (index !== -1) {
        elements.splice(index, 1);
    }
}

/**
 * Adds an element to an array after a specified element if the element is not already present in the array.
 *
 * @param elements - The array to which the element will be added.
 * @param afterElement - The element after which the new element will be added.
 * @param element - The element to be added to the array.
 */
export function addArrayElementAfter<T>(elements: T[], afterElement: T, element: T): void {
    const elementIndex = elements.indexOf(element);
    if (elementIndex === -1) {
        elements.splice(elements.indexOf(afterElement) + 1, 0, element);
    }
}

/**
 * Adds new elements to an array after a specified element, ensuring no duplicates.
 *
 * @param elements - The original array to modify.
 * @param afterElement - The element after which new elements will be added.
 * @param newElements - The new elements to add to the array.
 */
export function addArrayElementsAfter<T>(elements: T[], afterElement: T, newElements: T[]): void {
    const afterElementIndex = elements.indexOf(afterElement);
    if (afterElementIndex === -1) {
        return;
    }

    const newElementsToAdd = newElements.filter((element) => !elements.includes(element));
    elements.splice(afterElementIndex + 1, 0, ...newElementsToAdd);
}

/**
 * Adds an element to an array before a specified element if the element is not already present in the array.
 *
 * @param elements - The array to which the element will be added.
 * @param beforeElement - The element before which the new element will be added.
 * @param element - The element to be added to the array.
 */
export function addArrayElementBefore<T>(elements: T[], beforeElement: T, element: T): void {
    const elementIndex = elements.indexOf(element);
    if (elementIndex === -1) {
        elements.splice(elements.indexOf(beforeElement), 0, element);
    }
}

/**
 * Adds an element to an array if it is not already present.
 *
 * @param elements - The array to which the element should be added.
 * @param element - The element to add to the array.
 */
export function addArrayElement<T>(elements: T[], element: T): void {
    if (!elements.includes(element)) {
        elements.push(element);
    }
}

/**
 * Replaces an element in an array with a new element.
 *
 * @param elements - The array containing the element to be replaced.
 * @param element - The element to be replaced.
 * @param replacement - The new element to replace the old element.
 */
export function replaceArrayElement<T>(elements: T[], element: T, replacement: T): void {
    const index = elements.indexOf(element);
    if (index !== -1) {
        elements[index] = replacement;
    }
}
