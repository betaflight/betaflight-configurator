<template>
    <div class="logo" :title="tooltip">
        <div class="logo_image" aria-hidden="true"></div>
    </div>
</template>

<script>
import { computed, defineComponent } from "vue";
import { i18n } from "../../js/localization";

export default defineComponent({
    props: {
        configuratorVersion: {
            type: String,
            required: true,
        },
        firmwareVersion: {
            type: String,
            default: "",
        },
        firmwareId: {
            type: String,
            default: "",
        },
        hardwareId: {
            type: String,
            default: "",
        },
    },
    setup(props) {
        const tooltip = computed(() => {
            const lines = [`${i18n.getMessage("versionLabelConfigurator")}: ${props.configuratorVersion}`];
            if (props.firmwareVersion && props.firmwareId) {
                lines.push(`${i18n.getMessage("versionLabelFirmware")}: ${props.firmwareVersion} ${props.firmwareId}`);
            }
            if (props.hardwareId) {
                lines.push(`${i18n.getMessage("versionLabelTarget")}: ${props.hardwareId}`);
            }
            return lines.join("\n");
        });

        return { tooltip };
    },
});
</script>

<style>
.tab_container .logo {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.25rem 0 0.5rem;
    margin-bottom: 0.5rem;
}

.tab_container .logo_image {
    width: 100%;
    height: 48px;
    background-image: url(../../images/dark-wide-2.svg);
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
}

.dark .tab_container .logo_image {
    background-image: url(../../images/light-wide-2.svg);
}

@media (max-width: 1055px) {
    .tab_container .logo {
        align-items: center;
    }
    .tab_container .logo_image {
        width: 48px;
        background-size: auto 100%;
    }
}
</style>
