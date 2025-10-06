import Handlebars from "handlebars";
import { i18n } from "../localization";
import GUI, { TABS } from "../gui";
import { mspHelper } from "../msp/MSPHelper";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import $ from "jquery";

// Register Handlebars helpers
Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
});

// Discover config sources (text-based)
const templateFiles = import.meta.glob("../../norn-configs/template.hbs", { eager: true, as: "raw" });

const norn_config = {
    analyticsChanges: {},
};

norn_config.initialize = function (callback) {
    const self = this;

    GUI.active_tab = "norn_config";

    function load_configuration_from_fc() {
        // Load any prerequisite data from FC, then load the HTML
        mspHelper.readFullConfiguration?.(() => {
            $("#content").load("./tabs/norn_config.html", on_tab_loaded_handler);
        }) || $("#content").load("./tabs/norn_config.html", on_tab_loaded_handler);
    }

    function update_ui() {
        i18n.localizePage();

        // Populate Flight Controller list (explicit options)
        const fcSelect = $("select[name='norn_fc']");
        if (fcSelect.length) {
            fcSelect.empty();
            fcSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            fcSelect.append(`<option value="FLASHHOBBYF405">FLASHHOBBYF405</option>`);
            fcSelect.append(`<option value="SPEEDYBEEF405V3">SPEEDYBEEF405V3</option>`);
            fcSelect.append(`<option value="TAKERF722SE">TAKERF722SE</option>`);
            fcSelect.append(`<option value="GEPRCF722">GEPRCF722</option>`);
            fcSelect.on("change", function () {
                self.analyticsChanges["NornFC"] = $(this).val() || null;
            });
        }

        // Populate Drone Size list (explicit options)
        const droneSizeSelect = $("select[name='norn_drone_size']");
        if (droneSizeSelect.length) {
            droneSizeSelect.empty();
            droneSizeSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            droneSizeSelect.append(`<option value="7">7</option>`);
            droneSizeSelect.append(`<option value="8">8</option>`);
            droneSizeSelect.append(`<option value="9">9</option>`);
            droneSizeSelect.append(`<option value="10">10</option>`);
            droneSizeSelect.append(`<option value="13">13</option>`);
            droneSizeSelect.append(`<option value="15">15</option>`);
            droneSizeSelect.on("change", function () {
                self.analyticsChanges["NornDroneSize"] = $(this).val() || null;
            });
        }

        // Populate Manticore models (allow None) with explicit options
        const manticoreSelect = $("select[name='norn_manticore']");
        if (manticoreSelect.length) {
            manticoreSelect.empty();
            manticoreSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            manticoreSelect.append(`<option value="UART">UART</option>`);
            manticoreSelect.append(`<option value="GPIO">GPIO</option>`);
            manticoreSelect.on("change", function () {
                self.analyticsChanges["NornManticore"] = $(this).val() || null;
            });
        }

        // Populate VTX profiles (allow None) with explicit options
        const vtxSelect = $("select[name='norn_vtx']");
        if (vtxSelect.length) {
            vtxSelect.empty();
            vtxSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            vtxSelect.append(`<option value="3.3VTX">3.3GHz</option>`);
            vtxSelect.append(`<option value="5.8VTX">5.8GHz</option>`);
            vtxSelect.append(`<option value="OPTICA">Optica</option>`);
            vtxSelect.on("change", function () {
                self.analyticsChanges["NornVtx"] = $(this).val() || null;
            });
        }

        // Example dropdown wiring
        // none for now

        // Button wiring
        $("a.generate").on("click", on_generate_handler);
        $("a.copy").on("click", on_copy_handler);
        $("a.save").on("click", on_save_handler);

        // GPS toggle wiring
        const gpsToggle = $("#norn_gps");
        gpsToggle.on("change", function () {
            self.analyticsChanges["NornGPS"] = $(this).is(":checked");
        });

        // Craft name input wiring
        const craftNameInput = $("#norn_craft_name");
        craftNameInput.on("input", function () {
            self.analyticsChanges["NornCraftName"] = $(this).val() || null;
        });
    }

    function on_tab_loaded_handler() {
        update_ui();

        GUI.interval_add(
            "status_pull",
            function status_pull() {
                MSP.send_message(MSPCodes.MSP_STATUS);
            },
            500,
            true,
        );

        GUI.content_ready(callback);
    }

    // No save/copy handlers for now (kept minimal per request)

    function readFileRaw(pathMap, path) {
        if (!path) return "";
        try {
            return pathMap[path] || "";
        } catch (e) {
            console.error("Cannot read", path, e);
            return "";
        }
    }

    function getSelectedKeys() {
        const fcKey = $("select[name='norn_fc']").val() || "";
        const droneSize = $("select[name='norn_drone_size']").val() || "";
        const manticoreKey = $("select[name='norn_manticore']").val() || "";
        const vtxKey = $("select[name='norn_vtx']").val() || "";
        const gpsEnabled = $("#norn_gps").is(":checked");
        const craftName = $("#norn_craft_name").val() || "";
        return { fcKey, droneSize, manticoreKey, vtxKey, gpsEnabled, craftName };
    }

    function on_generate_handler(e) {
        e?.preventDefault?.();

        const templatePath = Object.keys(templateFiles)[0];
        let result;
        if (templatePath) {
            const tpl = readFileRaw(templateFiles, templatePath);
            const template = Handlebars.compile(tpl);
            result = template(getSelectedKeys());
        } else {
            // Fallback to old behavior if template missing
            const parts = [];
            const genericPath = Object.keys(genericFiles)[0];
            parts.push(readFileRaw(genericFiles, genericPath));
            const manticorePath = $("select[name='norn_manticore']").val();
            if (manticorePath) parts.push(readFileRaw(manticoreFiles, manticorePath));
            const vtxPath = $("select[name='norn_vtx']").val();
            if (vtxPath) parts.push(readFileRaw(vtxFiles, vtxPath));
            result = parts.filter(Boolean).join("\n\n").trim();
        }

        $("#norn_config_output").val(result);
    }

    function on_copy_handler(e) {
        e?.preventDefault?.();
        const text = $("#norn_config_output").val();
        if (text) {
            navigator.clipboard
                ?.writeText(text)
                .then(() => {
                    console.log("Config copied to clipboard");
                })
                .catch((err) => {
                    console.error("Failed to copy to clipboard:", err);
                });
        }
    }

    function on_save_handler(e) {
        e?.preventDefault?.();
        const text = $("#norn_config_output").val();
        if (!text) return;

        // Generate filename based on selected options
        const parts = [];
        const fcKey = $("select[name='norn_fc']").val();
        const droneSize = $("select[name='norn_drone_size']").val();
        const manticoreKey = $("select[name='norn_manticore']").val();
        const vtxKey = $("select[name='norn_vtx']").val();
        const gpsEnabled = $("#norn_gps").is(":checked");
        const craftName = $("#norn_craft_name").val();

        if (fcKey) parts.push(fcKey);
        if (droneSize) parts.push(`${droneSize}inch`);
        if (manticoreKey) parts.push(manticoreKey);
        if (vtxKey) parts.push(vtxKey);
        if (gpsEnabled) parts.push("GPS");
        if (craftName) parts.push(craftName);

        const filename = parts.length > 0 ? `norn_config_${parts.join("_")}.txt` : "norn_config.txt";

        // Create and trigger download
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    load_configuration_from_fc();
};

norn_config.cleanup = function (callback) {
    if (callback) callback();
};

TABS.norn_config = norn_config;
export { norn_config };
