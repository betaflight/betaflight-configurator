<template>
    <div class="logo">
        <div class="logo_image" aria-hidden="true"></div>
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

.tab_container .logo_text {
    display: flex;
    flex-direction: column;
    margin-top: 0.25rem;
    color: var(--text);
    font-size: 10px;
    line-height: 1.3;
    text-align: left;
}
</style>
