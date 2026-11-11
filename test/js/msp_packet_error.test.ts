import { describe, expect, it } from "vitest";
import { computed } from "vue";
import MSP from "../../src/js/msp";
import { pinia } from "../../src/js/pinia_instance";
import { useConnectionStore } from "../../src/stores/connection";

describe("MSP.packet_error", () => {
    it("is owned by the connection store, so a status-bar binding sees each increment", () => {
        const connectionStore = useConnectionStore(pinia);
        const shown = computed(() => connectionStore.packetErrors);
        MSP.packet_error = 0;
        expect(shown.value).toBe(0);

        MSP.packet_error++;
        expect(shown.value).toBe(1);

        MSP.disconnect_cleanup();
        expect(shown.value).toBe(0);
    });
});
