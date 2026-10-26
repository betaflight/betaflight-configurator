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
 * A FIFO cache to hold key-pair mappings. Its capacity will be at least the initialCapacity
 * supplied on creation, which you can increase by increasing the "capacity" property.
 *
 * One extra element beyond the set capacity will be stored which can be fetched by calling "recycle()".
 * This allows the oldest value to be removed in order to be reused, instead of leaving it to be collected
 * by the garbage collector.
 *
 * Element age is determined by the time it was added or last get()'d from the cache.
 *
 * Keys are stored as object properties, so `1` and `"1"` name the same entry.
 */
export class FIFOCache<K extends string | number, V> {
    capacity: number;
    private queue: K[] = [];
    private items: Record<string | number, V> = {};

    constructor(initialCapacity: number) {
        this.capacity = initialCapacity;
    }

    private removeFromQueue(key: K): void {
        const queue = this.queue;
        for (let i = 0; i < queue.length; i++) {
            if (queue[i] === key) {
                //Assume there's only one copy to remove:
                for (let j = i; j < queue.length - 1; j++) {
                    queue[j] = queue[j + 1];
                }

                queue.length--;
                break;
            }
        }
    }

    /**
     * Remove and return the oldest value from the cache to be reused, or null if the cache wasn't full.
     */
    recycle(): V | null {
        if (this.queue.length > this.capacity) {
            const key = this.queue.shift() as K,
                result = this.items[key];

            delete this.items[key];

            return result;
        }

        return null;
    }

    /**
     * Add a mapping for the given key to the cache. If an existing value with that key was
     * present, it will be overwritten.
     */
    add(key: K, value: V): void {
        // Was this already cached? Bump it back up to the end of the queue
        if (this.items[key] !== undefined) {
            this.removeFromQueue(key);
        }

        this.queue.push(key);

        this.items[key] = value;

        while (this.queue.length > this.capacity + 1) {
            delete this.items[this.queue.shift() as K];
        }
    }

    /**
     * Return the value in the cache that corresponds to the given key, or undefined if it has
     * expired or had never been stored.
     */
    get(key: K): V | undefined {
        const item: V | undefined = this.items[key];

        if (item) {
            this.removeFromQueue(key);
            this.queue.push(key);
        }

        return item;
    }

    /**
     * Erase the entire content of the cache
     */
    clear(): void {
        this.queue = [];
        this.items = {};
    }
}
