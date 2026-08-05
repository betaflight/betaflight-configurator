/**
 * A FIFO cache to hold key-pair mappings. Its capacity will be at least the initialCapacity
 * supplied on creation, which you can increase by increasing the "capacity" property.
 *
 * One extra element beyond the set capacity will be stored which can be fetched by calling "recycle()".
 * This allows the oldest value to be removed in order to be reused, instead of leaving it to be collected
 * by the garbage collector.
 *
 * Element age is determined by the time it was added or last get()'d from the cache.
 */
export function FIFOCache(initialCapacity) {
    //Private:
    let queue = [],
        items = {};

    function removeFromQueue(key) {
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

    //Public:
    this.capacity = initialCapacity;

    /**
     * Remove and return the oldest value from the cache to be reused, or null if the cache wasn't full.
     */
    this.recycle = function () {
        if (queue.length > this.capacity) {
            const key = queue.shift(),
                result = items[key];

            delete items[key];

            return result;
        }

        return null;
    };

    /**
     * Add a mapping for the given key to the cache. If an existing value with that key was
     * present, it will be overwritten.
     */
    this.add = function (key, value) {
        // Was this already cached? Bump it back up to the end of the queue
        if (items[key] !== undefined) {
            removeFromQueue(key);
        }

        queue.push(key);

        items[key] = value;

        while (queue.length > this.capacity + 1) {
            delete items[queue.shift()];
        }
    };

    /**
     * Return the value in the cache that corresponds to the given key, or undefined if it has
     * expired or had never been stored.
     */
    this.get = function (key) {
        const item = items[key];

        if (item) {
            removeFromQueue(key);
            queue.push(key);
        }

        return item;
    };

    /**
     * Erase the entire content of the cache
     */
    this.clear = function () {
        queue = [];
        items = {};
    };
}
