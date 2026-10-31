/**
 * Listening to taps outside a run: while the Frame tab is open and no frame test runs, the FC hears a tap on
 * the frame and reports its peaks (MSP2_FRAME_WIZARD_LISTEN), so the resonance chart can light the modes it
 * rang. Nothing is stored on the FC; listening ends by itself once the polls stop.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { isMspCancelled } from "../js/msp/mspErrors";
import { useFrameWizardStore } from "./frameWizard";
import { encodeListen, parseListen, type ListenTap } from "./frameWizardProtocol";

const LISTEN_POLL_MS = 50; // the tap shows within a poll of the FC having its peaks (a few dozen bytes each way on USB)
/** How long a tap stays lit in the chart. */
export const LISTEN_SHOW_MS = 2000;

export const useFrameListenStore = defineStore("frameListen", () => {
    /** null until tried; false when the firmware cannot listen (the chart then stays as it is). */
    const supported = ref<boolean | null>(null);
    /** The last tap heard, and when (host time, ms). */
    const tap = ref<ListenTap | null>(null);
    const heardAt = ref(0);
    /** When the detector last fired (host time, ms): the tap is heard, its peaks follow. */
    const triggeredAt = ref(0);
    let triggerSeq: number | null = null;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let listening = false;
    let requested = false;

    async function poll() {
        timer = null;
        const wizard = useFrameWizardStore();
        // a run owns the link and the FC's tap detector; listening asks again once it is over
        if (wizard.active || wizard.starting) {
            requested = false;
        } else {
            try {
                await listenOnce();
            } catch (error) {
                if (isMspCancelled(error)) {
                    stop();
                    return;
                }
                console.warn("Frame listen poll failed:", error);
            }
        }
        if (listening && supported.value !== false) {
            timer = setTimeout(poll, LISTEN_POLL_MS);
        }
    }

    async function listenOnce() {
        if (!requested) {
            // listening takes the buffer of the motor run's response pages: keep them first
            await useFrameWizardStore().keepResponses();
            // refused while armed, a run or an excitation session is on: asked again on the next poll
            const reply = await MSP.promise(MSPCodes.MSP2_SET_FRAME_WIZARD, encodeListen());
            requested = !!reply && !reply.unsupported;
        }
        const reply = await MSP.promise(MSPCodes.MSP2_FRAME_WIZARD_LISTEN);
        const view = reply && !reply.unsupported ? reply.data : null;
        const parsed = view ? parseListen(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) : null;
        if (!parsed) {
            supported.value = false;
            return;
        }
        supported.value = true;
        // the FC dropped the mode (armed, a run came and went, a timeout): ask again on the next poll
        requested = parsed.active;
        if (parsed.trigger && parsed.trigger.seq !== triggerSeq) {
            triggerSeq = parsed.trigger.seq;
            triggeredAt.value = Date.now() - parsed.trigger.ageMs;
        }
        const heard = parsed.tap;
        if (heard && heard.seq !== tap.value?.seq) {
            tap.value = heard;
            heardAt.value = Date.now() - heard.ageMs;
        }
    }

    function start() {
        if (listening) {
            return;
        }
        listening = true;
        requested = false;
        timer = setTimeout(poll, 0);
    }

    function stop() {
        listening = false;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function detach() {
        stop();
        supported.value = null;
        tap.value = null;
        heardAt.value = 0;
        triggeredAt.value = 0;
        triggerSeq = null;
    }

    return { supported, tap, heardAt, triggeredAt, start, stop, detach };
});
