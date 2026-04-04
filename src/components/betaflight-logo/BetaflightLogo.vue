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
.logo {
    height: 70px;
    width: 240px;
    background-image: url(../../images/dark-wide-2.svg);
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
    position: relative;
}

.dark-theme .logo {
    background-image: url(../../images/light-wide-2.svg);
}

.logo_text {
    position: absolute;
    left: 80px;
    top: 49px;
    color: var(--text);
    font-size: 10px;
    display: flex;
    flex-direction: column;
}

.tab_container .logo {
    display: none;
}

@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    .logo {
        height: 24px;
        width: 150px;
        background-image: url(../../images/dark-wide-2-compact.svg);
        background-position: left center;
        order: 2;
        margin-top: 0;
    }
    .dark-theme .logo {
        background-image: url(../../images/light-wide-2-compact.svg);
    }
    .logo_text {
        display: none !important;
    }
    .tab_container .logo {
        display: flex;
        align-items: flex-start;
        background-image: none;
        height: auto;
        width: 100%;
        flex: 0 0 auto;
        margin-bottom: 0;
        padding: 0;
        box-sizing: border-box;
    }
    .dark-theme .tab_container .logo {
        background-image: none;
    }
    .tab_container .logo .logo_text {
        display: flex !important;
        position: relative;
        left: auto;
        top: auto;
        width: 100%;
        font-size: 10px;
        line-height: 1.35;
    }
}

@media all and (min-width: 1125px) {
    .logo {
        width: 340px;
    }

    .logo_text {
        font-size: inherit;
        position: relative;
    }
}
</style>
