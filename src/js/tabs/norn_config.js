import ejs from "ejs";
import { i18n } from "../localization";
import GUI, { TABS } from "../gui";
import { mspHelper } from "../msp/MSPHelper";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import $ from "jquery";

// Discover config sources (text-based)
const templateFiles = import.meta.glob("../../norn-configs/template.ejs", { eager: true, as: "raw" });

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

        // Populate Manticore models (allow None) with explicit options
        const manticoreSelect = $("select[name='norn_manticore']");
        if (manticoreSelect.length) {
            manticoreSelect.empty();
            manticoreSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            manticoreSelect.append(`<option value="uart">UART</option>`);
            manticoreSelect.append(`<option value="gpio">GPIO</option>`);
            manticoreSelect.on("change", function () {
                self.analyticsChanges["NornManticore"] = $(this).val() || null;
            });
        }

        // Populate VTX profiles (allow None) with explicit options
        const vtxSelect = $("select[name='norn_vtx']");
        if (vtxSelect.length) {
            vtxSelect.empty();
            vtxSelect.append(`<option value="">${i18n.getMessage("nornNone")}</option>`);
            vtxSelect.append(`<option value="3.3_vtx">3.3GHz</option>`);
            vtxSelect.append(`<option value="5.8_vtx">5.8GHz</option>`);
            vtxSelect.append(`<option value="optica">Optica</option>`);
            vtxSelect.on("change", function () {
                self.analyticsChanges["NornVtx"] = $(this).val() || null;
            });
        }

        // Example dropdown wiring
        const exampleSelect = $("select[name='norn_mode']");
        if (exampleSelect.length) {
            exampleSelect.on("change", function () {
                const value = $(this).val();
                self.analyticsChanges["NornMode"] = value;
            });
        }

        // Example button wiring
        $("a.generate").on("click", on_generate_handler);
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
        const manticoreKey = $("select[name='norn_manticore']").val() || "";
        const vtxKey = $("select[name='norn_vtx']").val() || "";
        return { manticoreKey, vtxKey };
    }

    function on_generate_handler(e) {
        e?.preventDefault?.();

        const templatePath = Object.keys(templateFiles)[0];
        let result;
        if (templatePath) {
            const tpl = readFileRaw(templateFiles, templatePath);
            result = ejs.render(tpl, getSelectedKeys());
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

    load_configuration_from_fc();
};

norn_config.cleanup = function (callback) {
    if (callback) callback();
};

TABS.norn_config = norn_config;
export { norn_config };
