import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useMotorOutputReordering } from "../../../../src/composables/motors/useMotorOutputReordering";

const saveAndReboot = vi.fn();

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));
vi.mock("../../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));

describe("useMotorOutputReordering", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
    });

    describe("spinOnlyMotor", () => {
        it("sends one little-endian u16 per motor, spinning only the chosen one", () => {
            useMotorOutputReordering().spinOnlyMotor(1, 3, 0x0456, 0x03e8);

            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
                MSPCodes.MSP_SET_MOTOR,
                [0xe8, 0x03, 0x56, 0x04, 0xe8, 0x03],
            );
        });

        it("stops every motor for index -1", () => {
            useMotorOutputReordering().spinOnlyMotor(-1, 2, 1100, 1000);

            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP_SET_MOTOR, [0xe8, 0x03, 0xe8, 0x03]);
        });
    });

    describe("saveMotorOutputOrder", () => {
        it("puts a copy of the order in the store before crunching the payload", () => {
            const order = [2, 0, 1, 3];
            vi.mocked(mspHelper.crunch).mockImplementation(() => {
                expect(fcStore.motorOutputOrder).toEqual([2, 0, 1, 3]);
                return [4, 2, 0, 1, 3];
            });

            useMotorOutputReordering().saveMotorOutputOrder(order);
            order[0] = 9;

            expect(mspHelper.crunch).toHaveBeenCalledExactlyOnceWith(MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING);
            expect(MSP.send_message).toHaveBeenCalledExactlyOnceWith(
                MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING,
                [4, 2, 0, 1, 3],
                false,
                expect.any(Function),
            );
            expect(fcStore.motorOutputOrder).toEqual([2, 0, 1, 3]);
        });

        it("saves and reboots only once the FC acknowledges, with no arguments", () => {
            useMotorOutputReordering().saveMotorOutputOrder([0, 1]);
            expect(saveAndReboot).not.toHaveBeenCalled();

            const onReply = vi.mocked(MSP.send_message).mock.calls[0][3] as (...args: unknown[]) => void;
            onReply("reply-data");

            expect(saveAndReboot).toHaveBeenCalledExactlyOnceWith();
        });
    });
});
