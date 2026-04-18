<template>
    <div class="logo">
        <div class="logo_text">
            <span> {{ $t("versionLabelConfigurator") }}: {{ configuratorVersion }} </span>
            <span v-if="firmwareVersion && firmwareId">
                {{ $t("versionLabelFirmware") }}: {{ firmwareVersion }}
                {{ firmwareId }}
            </span>
            <span v-if="hardwareId"> {{ $t("versionLabelTarget") }}: {{ hardwareId }} </span>
        </div>
    </div>
</template>

<script>
export default {
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
};
</script>

<style>
.tab_container .logo {
    display: block;
    width: 100%;
    height: 56px;
    background-image: url(../../images/dark-wide-2.svg);
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    position: relative;
}

.dark .tab_container .logo {
    background-image: url(../../images/light-wide-2.svg);
}

.tab_container .logo .logo_text {
    display: flex;
    flex-direction: column;
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.25rem;
    color: var(--text);
    font-size: 10px;
    line-height: 1.3;
    text-align: left;
    padding-left: 0.25rem;
}
</style>
