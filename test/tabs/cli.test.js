import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    afterEach,
    beforeEach,
    vi,
} from "vitest";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import { cli } from "../../src/js/tabs/cli";
import "jquery-textcomplete";
import $ from "jquery";
import CONFIGURATOR from "../../src/js/data_storage";
import GUI from "../../src/js/gui";

class MockAnalytics {
    sendEvent() {
        // Empty
    }
}

MockAnalytics.prototype.EVENT_CATEGORIES = {};

function toArrayBuffer(string) {
    const bufferOut = new ArrayBuffer(string.length);
    const bufView = new Uint8Array(bufferOut);

    for (let i = 0; i < string.length; i++) {
        bufView[i] = string.charCodeAt(i);
    }

    return bufferOut;
}

function triggerEnterKey(input) {
    const enterKeycode = 13;
    const event = $.Event("keypress");
    event.which = enterKeycode;
    input.trigger(event);
}

function triggerTabKey(input) {
    const tabKeycode = 9;
    const event = $.Event("keydown");
    event.which = tabKeycode;
    input.trigger(event);
}

const backspaceCode = String.fromCharCode(127);

beforeAll(() => {
    window.tracking = new MockAnalytics();
});

describe("cli", () => {
    describe("output", () => {
        let cliTab;
        let cliOutput;
        let cliPrompt;

        beforeAll(() => {
            cliTab = $("<div>").addClass("tab-cli");
            cliOutput = $("<div>").addClass("wrapper");
            cliPrompt = $('<textarea name="commands">');

            cliTab.append($("<div>").addClass("window").append(cliOutput));
            cliTab.append(cliPrompt);

            CliAutoComplete.setEnabled(false); // not testing the client-side autocomplete

            $("body").append(cliTab);

            CONFIGURATOR.cliValid = true;
            cli.GUI.windowWrapper = cliOutput;
        });
        afterAll(() => {
            cliTab.remove();
        });
        beforeEach(() => {
            cliOutput.empty();
            cliPrompt.val("");
            cli.cliBuffer = "";
        });
        it("ambiguous auto-complete results", () => {
            cli.cliBuffer = "se";
            cli.read({
                data: toArrayBuffer(
                    "\r\x1B[Kserialpassthrough\tservo\r\n# ser",
                ),
            });
            // Ambigous auto-complete from firmware is preceded with an \r carriage return
            // which only renders a line break on Mac
            const expectedValue =
                GUI.operating_system !== "Windows"
                    ? "se<br>serialpassthrough\tservo<br>"
                    : "seserialpassthrough\tservo<br>";
            expect(cliOutput.html()).toEqual(expectedValue);
            expect(cliPrompt.val()).toEqual("ser");
        });
        it("unambiguous auto-complete result", () => {
            cli.read({
                data: toArrayBuffer("serialpassthrough"),
            });

            expect(cliOutput.html()).toEqual("");
            expect(cliPrompt.val()).toEqual("serialpassthrough");
        });

        it("unambiguous auto-complete result with partial buffer", () => {
            cli.cliBuffer = "serial";

            cli.read({
                data: toArrayBuffer("passthrough"),
            });

            expect(cliOutput.html()).toEqual("");
            expect(cliPrompt.val()).toEqual("serialpassthrough");
        });

        it("escape characters are skipped", () => {
            cli.read({
                data: toArrayBuffer("\x1B[K"),
            });

            expect(cliOutput.html()).toEqual("");
            expect(cliPrompt.val()).toEqual("");
        });
    });

    describe("input", () => {
        let content;
        let cliTab;
        let cliPrompt;

        beforeAll(() => {
            content = $("<div>").attr("id", "content");
            cliTab = $("<div>").addClass("tab-cli");
            cliPrompt = $('<textarea name="commands">');
            cliTab.append(cliPrompt);
            $("body").append(content);

            vi.spyOn($.fn, "load").mockImplementation((file, callback) => {
                content.append(cliTab);
                // callback();
            });
            vi.mock("../src/js/tabs/cli", async (importOriginal) => {
                const mod = await importOriginal();
                return {
                    ...mod,
                    send: () => {},
                };
            });

            vi.spyOn(GUI, "timeout_add").mockImplementation((name, cb) => {
                cb();
            });
            cli.cliBuffer = "";
        });
        afterEach(() => {
            content.remove();
            vi.resetAllMocks();
        });
        beforeEach(() => {
            cliPrompt.val("");
            content.empty("");
        });

        it("tab key triggers serial message with appended tab char", (done) => {
            cli.initialize(() => {
                cliPrompt.val("serial");

                triggerTabKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith("serial\t");
                done();
            });
        });

        it("second auto complete in row", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# ser";

                cliPrompt.val("seri");

                triggerTabKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith("i\t");
                done();
            });
        });

        it("auto-complete command with trailing space", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# get ";

                cliPrompt.val("get r");

                triggerTabKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith("r\t");
                done();
            });
        });

        it("auto-complete after delete characters", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# serial";

                cliPrompt.val("ser");

                triggerTabKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith(
                    `${backspaceCode.repeat(3)}\t`,
                );
                done();
            });
        });

        it("enter after autocomplete", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# servo";

                cliPrompt.val("servo");

                triggerEnterKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith("\n");
                done();
            });
        });

        it("enter after autocomplete", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# ser";

                cliPrompt.val("servo");

                triggerEnterKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith("vo\n");
                done();
            });
        });

        it("enter after deleting characters", (done) => {
            cli.initialize(() => {
                cli.cliBuffer = "# serial";

                cliPrompt.val("ser");

                triggerEnterKey(cliPrompt);

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith(
                    `${backspaceCode.repeat(3)}\n`,
                );
                done();
            });
        });

        it("cliBuffer is cleared on startup", (done) => {
            cli.cliBuffer = "# serial";

            cli.initialize(() => {
                expect(cli.cliBuffer).to.equal("");
                done();
            });
        });

        it("exit upon cleanup clears cliBuffer first", (done) => {
            CONFIGURATOR.connectionValid = true;
            cli.cliValid = true;

            cli.initialize(() => {
                const commandInBuffer = "resource";

                cli.cliBuffer = `# ${commandInBuffer}`;

                cli.cleanup();

                expect(cli.send).toHaveBeenCalledOnce();
                expect(cli.send).toHaveBeenCalledWith(
                    `${backspaceCode.repeat(commandInBuffer.length)}exit\r`,
                );
                done();
            });
        });
    });
});
